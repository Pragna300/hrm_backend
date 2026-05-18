const http = require('http');
const fs = require('fs');

http.get('http://localhost:5000/api/public/debug-users', (res) => {
  let data = '';
  res.on('data', (chunk) => { data += chunk; });
  res.on('end', () => {
    fs.writeFileSync('users_output.json', data);
    console.log('Successfully saved users to users_output.json');
  });
}).on('error', (err) => {
  console.error('Error fetching:', err.message);
});
