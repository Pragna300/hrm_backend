const express = require('express');
const { verifyJWT } = require('../middleware/auth');
const { rbac } = require('../middleware/rbac');
const contactInquiryController = require('../controllers/contactInquiryController');

// Define routers
const publicRouter = express.Router();
const adminRouter = express.Router();

// Public Endpoint
publicRouter.post('/', contactInquiryController.submitInquiry);

// Admin Endpoints
adminRouter.use(verifyJWT, rbac('superAdmin'));
adminRouter.get('/', contactInquiryController.getInquiries);
adminRouter.patch('/:id', contactInquiryController.updateInquiry);
adminRouter.delete('/:id', contactInquiryController.deleteInquiry);

module.exports = {
  publicRouter,
  adminRouter
};
