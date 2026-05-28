const { prisma } = require('../config/database');

/**
 * Normalizes start and end dates.
 */
function getParsedDates(startDate, endDate) {
  const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1);
  const end = endDate ? new Date(endDate) : new Date();
  
  // Set boundaries
  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

/**
 * Groups and aggregates users by granularity (monthly or yearly) in JavaScript.
 * Ensures consistent behavior across all DBMS.
 */
function aggregateUsersByPeriod(users, granularity, start, end) {
  const periods = {};

  // Build the continuous list of periods to ensure periods with 0 registrations are represented
  const current = new Date(start);
  while (current <= end) {
    let key;
    if (granularity === 'yearly') {
      key = `${current.getFullYear()}`;
      current.setFullYear(current.getFullYear() + 1);
    } else {
      const mm = String(current.getMonth() + 1).padStart(2, '0');
      key = `${current.getFullYear()}-${mm}`;
      current.setMonth(current.getMonth() + 1);
    }
    periods[key] = {
      period: key,
      total: 0,
      admin: 0,
      employee: 0,
      manager: 0,
      accountant: 0,
    };
  }

  // Populate actual data
  users.forEach((user) => {
    const date = new Date(user.createdAt || new Date());
    let key;
    if (granularity === 'yearly') {
      key = `${date.getFullYear()}`;
    } else {
      const mm = String(date.getMonth() + 1).padStart(2, '0');
      key = `${date.getFullYear()}-${mm}`;
    }

    if (!periods[key]) {
      periods[key] = {
        period: key,
        total: 0,
        admin: 0,
        employee: 0,
        manager: 0,
        accountant: 0,
      };
    }

    periods[key].total += 1;

    // Role-wise Aggregation:
    // super_admin -> Admin, manager -> Manager, hr -> Accountant, employee/team_lead -> Employee
    if (user.role === 'super_admin') {
      periods[key].admin += 1;
    } else if (user.role === 'manager') {
      periods[key].manager += 1;
    } else if (user.role === 'hr') {
      periods[key].accountant += 1;
    } else {
      periods[key].employee += 1;
    }
  });

  return Object.values(periods).sort((a, b) => a.period.localeCompare(b.period));
}

/**
 * Returns registration overview cards data
 */
async function getRegistrationOverview(orgId, { granularity = 'monthly', startDate, endDate } = {}) {
  const { start, end } = getParsedDates(startDate, endDate);

  const whereClause = {
    createdAt: { gte: start, lte: end },
  };
  if (orgId) {
    whereClause.organizationId = orgId;
  }

  const users = await prisma.user.findMany({
    where: whereClause,
    select: { createdAt: true, role: true },
  });

  const aggregated = aggregateUsersByPeriod(users, granularity, start, end);
  const totalRegistrations = users.length;
  const periodCount = aggregated.length || 1;
  const avgPerPeriod = Math.round((totalRegistrations / periodCount) * 10) / 10;

  // Peak period calculation
  let peakPeriod = 'N/A';
  let peakValue = 0;
  aggregated.forEach((item) => {
    if (item.total > peakValue) {
      peakValue = item.total;
      peakPeriod = item.period;
    }
  });

  // Current period count & growth
  const currentPeriodItem = aggregated[aggregated.length - 1];
  const currentPeriodCount = currentPeriodItem ? currentPeriodItem.total : 0;
  const currentPeriodLabel = currentPeriodItem ? currentPeriodItem.period : 'N/A';

  const prevPeriodItem = aggregated[aggregated.length - 2];
  const prevPeriodCount = prevPeriodItem ? prevPeriodItem.total : 0;

  let growthIndicator = 0;
  if (prevPeriodCount > 0) {
    growthIndicator = Math.round(((currentPeriodCount - prevPeriodCount) / prevPeriodCount) * 100);
  } else if (currentPeriodCount > 0) {
    growthIndicator = 100;
  }

  return {
    totalRegistrations,
    avgPerPeriod,
    peakPeriod: peakPeriod !== 'N/A' ? `${peakPeriod} — ${peakValue} Registrations` : 'N/A',
    currentPeriod: {
      period: currentPeriodLabel,
      count: currentPeriodCount,
      growth: growthIndicator,
    },
  };
}

/**
 * Returns data for charts switch tabs
 */
async function getRegistrationCharts(orgId, { granularity = 'monthly', startDate, endDate } = {}) {
  const { start, end } = getParsedDates(startDate, endDate);

  const whereClause = {
    createdAt: { gte: start, lte: end },
  };
  if (orgId) {
    whereClause.organizationId = orgId;
  }

  const users = await prisma.user.findMany({
    where: whereClause,
    select: { createdAt: true, role: true },
  });

  const aggregated = aggregateUsersByPeriod(users, granularity, start, end);

  // Pie chart aggregation (overall distribution by role)
  let totalAdmin = 0;
  let totalEmployee = 0;
  let totalManager = 0;
  let totalAccountant = 0;

  users.forEach((u) => {
    if (u.role === 'super_admin') totalAdmin++;
    else if (u.role === 'manager') totalManager++;
    else if (u.role === 'hr') totalAccountant++;
    else totalEmployee++;
  });

  const total = users.length || 1;
  const pieChartData = [
    { name: 'Admin', value: totalAdmin, percentage: Math.round((totalAdmin / total) * 100) },
    { name: 'Employee', value: totalEmployee, percentage: Math.round((totalEmployee / total) * 100) },
    { name: 'Manager', value: totalManager, percentage: Math.round((totalManager / total) * 100) },
    { name: 'Accountant', value: totalAccountant, percentage: Math.round((totalAccountant / total) * 100) },
  ];

  return {
    barChartData: aggregated,
    lineChartData: aggregated,
    pieChartData,
    totalRegistrations: users.length,
  };
}

/**
 * Returns paginated & filtered table rows
 */
async function getRegistrationTable(orgId, { granularity = 'monthly', startDate, endDate, page = 1, pageSize = 10, search = '', sortBy = 'period', sortOrder = 'desc' } = {}) {
  const { start, end } = getParsedDates(startDate, endDate);

  const whereClause = {
    createdAt: { gte: start, lte: end },
  };
  if (orgId) {
    whereClause.organizationId = orgId;
  }

  const users = await prisma.user.findMany({
    where: whereClause,
    select: { createdAt: true, role: true },
  });

  let rows = aggregateUsersByPeriod(users, granularity, start, end);

  // Search filtering
  if (search) {
    const q = search.toLowerCase().trim();
    rows = rows.filter((r) => r.period.toLowerCase().includes(q));
  }

  // Sorting
  rows.sort((a, b) => {
    let fieldA = a[sortBy] ?? '';
    let fieldB = b[sortBy] ?? '';
    if (typeof fieldA === 'string') {
      return sortOrder === 'asc' ? fieldA.localeCompare(fieldB) : fieldB.localeCompare(fieldA);
    }
    return sortOrder === 'asc' ? fieldA - fieldB : fieldB - fieldA;
  });

  // Pagination
  const total = rows.length;
  const startIdx = (page - 1) * pageSize;
  const paginatedRows = rows.slice(startIdx, startIdx + pageSize);

  return {
    rows: paginatedRows,
    total,
    page,
    pageSize,
  };
}

/**
 * Returns invoice financial data
 */
async function getRegistrationFinancials(orgId, { startDate, endDate } = {}) {
  const { start, end } = getParsedDates(startDate, endDate);

  const whereClause = {
    issuedAt: { gte: start, lte: end },
  };
  if (orgId) {
    whereClause.organizationId = orgId;
  }

  const invoices = await prisma.invoice.findMany({
    where: whereClause,
    select: { amount: true, status: true },
  });

  let totalInvoiceAmount = 0;
  let totalRevenue = 0;
  let pendingRevenue = 0;
  let paidInvoicesCount = 0;

  invoices.forEach((invoice) => {
    const amount = Number(invoice.amount) || 0;
    totalInvoiceAmount += amount;
    if (invoice.status === 'paid') {
      totalRevenue += amount;
      paidInvoicesCount += 1;
    } else if (invoice.status === 'issued') {
      pendingRevenue += amount;
    }
  });

  return {
    totalInvoiceAmount: Number(totalInvoiceAmount.toFixed(2)),
    totalRevenue: Number(totalRevenue.toFixed(2)),
    pendingRevenue: Number(pendingRevenue.toFixed(2)),
    paidInvoicesCount,
  };
}

/**
 * Returns formatted CSV content for export
 */
async function exportRegistrationData(orgId, { granularity = 'monthly', startDate, endDate } = {}) {
  const { start, end } = getParsedDates(startDate, endDate);

  const whereClause = {
    createdAt: { gte: start, lte: end },
  };
  if (orgId) {
    whereClause.organizationId = orgId;
  }

  const users = await prisma.user.findMany({
    where: whereClause,
    select: { createdAt: true, role: true },
  });

  const rows = aggregateUsersByPeriod(users, granularity, start, end);
  const financials = await getRegistrationFinancials(orgId, { startDate, endDate });

  const headers = ['Period', 'Total Registrations', 'Admin', 'Employee', 'Manager', 'Accountant'];
  const csvRows = [
    headers.join(','),
    ...rows.map((r) => [
      r.period,
      r.total,
      r.admin,
      r.employee,
      r.manager,
      r.accountant
    ].join(',')),
    '',
    'Financial Summary',
    `Total Generated Invoices Amount,${financials.totalInvoiceAmount}`,
    `Total Paid Revenue,${financials.totalRevenue}`,
    `Pending Revenue,${financials.pendingRevenue}`,
    `Paid Invoices Count,${financials.paidInvoicesCount}`
  ];

  return csvRows.join('\n');
}

module.exports = {
  getRegistrationOverview,
  getRegistrationCharts,
  getRegistrationTable,
  getRegistrationFinancials,
  exportRegistrationData,
};
