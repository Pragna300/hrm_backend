const fs = require('fs');
const path = require('path');
const { prisma } = require('../config/database');
const cloudinary = require('../config/cloudinary');
const { ok, fail } = require('../utils/response');

const getDocuments = async (req, res) => {
  try {
    const { organizationId } = req.user;
    
    // We only fetch documents belonging to the user's organization.
    const documents = await prisma.employeeDocument.findMany({
      where: { organizationId },
      include: {
        employee: {
          select: { firstName: true, lastName: true, employeeCode: true }
        },
        uploadedBy: {
          select: { email: true, role: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
    
    return ok(res, { data: documents });
  } catch (error) {
    console.error('[DocumentController.getDocuments]', error);
    return fail(res, 'Failed to fetch documents', 500);
  }
};

const getDocumentById = async (req, res) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.user;
    
    const document = await prisma.employeeDocument.findFirst({
      where: { id: parseInt(id), organizationId },
      include: {
        employee: { select: { firstName: true, lastName: true, employeeCode: true } },
        uploadedBy: { select: { email: true, role: true } }
      }
    });
    
    if (!document) {
      return fail(res, 'Document not found', 404);
    }
    
    return ok(res, { data: document });
  } catch (error) {
    console.error('[DocumentController.getDocumentById]', error);
    return fail(res, 'Failed to fetch document details', 500);
  }
};

const uploadDocument = async (req, res) => {
  try {
    const { organizationId, userId, role } = req.user;
    
    // Check role permission
    if (!['super_admin', 'manager', 'hr'].includes(role)) {
      if (req.file) fs.unlinkSync(req.file.path);
      return fail(res, 'Not authorized to upload documents', 403);
    }
    
    const { title, description, category, visibilityScope, employeeId } = req.body;
    
    if (!req.file) {
      return fail(res, 'No file uploaded', 400);
    }
    
    if (!title) {
      fs.unlinkSync(req.file.path);
      return fail(res, 'Title is required', 400);
    }
    
    if (!process.env.CLOUDINARY_CLOUD_NAME || !process.env.CLOUDINARY_API_KEY || !process.env.CLOUDINARY_API_SECRET) {
      fs.unlinkSync(req.file.path);
      return fail(res, 'Cloudinary environment variables are missing on the server.', 500);
    }

    const isOrganizationWide = visibilityScope === 'org_wide';
    
    // Upload to Cloudinary
    // Note: resource_type 'auto' allows PDFs, Images, Word, Excel, etc.
    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: `hrm_portal/org_${organizationId}/documents`,
      resource_type: 'auto',
      use_filename: true,
      unique_filename: true
    });
    
    // Delete local file after upload
    fs.unlinkSync(req.file.path);

    const fileUrl = result.secure_url;
    
    const newDoc = await prisma.employeeDocument.create({
      data: {
        organizationId,
        uploadedByUserId: userId,
        title,
        description: description || null,
        category: category || 'General',
        isOrganizationWide,
        employeeId: isOrganizationWide ? null : (employeeId ? parseInt(employeeId) : null),
        fileUrl,
        fileType: req.file.mimetype,
        fileSize: req.file.size
      }
    });
    
    return ok(res, { data: newDoc }, 201);
  } catch (error) {
    console.error('[DocumentController.uploadDocument]', error);
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    return fail(res, 'Failed to upload document', 500);
  }
};

const deleteDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { organizationId, role } = req.user;
    
    if (!['super_admin', 'manager', 'hr'].includes(role)) {
      return fail(res, 'Not authorized to delete documents', 403);
    }
    
    const document = await prisma.employeeDocument.findFirst({
      where: { id: parseInt(id), organizationId }
    });
    
    if (!document) {
      return fail(res, 'Document not found', 404);
    }
    
    // Extract public_id from Cloudinary URL if possible, to delete it
    try {
       const urlParts = document.fileUrl.split('/');
       if (urlParts.includes('upload')) {
         const uploadIndex = urlParts.indexOf('upload');
         let publicIdParts = urlParts.slice(uploadIndex + 1);
         if (publicIdParts[0].startsWith('v')) {
           publicIdParts = publicIdParts.slice(1);
         }
         let publicId = publicIdParts.join('/');
         const isRaw = document.fileUrl.includes('/raw/upload/');
         if (!isRaw && publicId.includes('.')) {
           publicId = publicId.substring(0, publicId.lastIndexOf('.'));
         }
         
         const resourceType = document.fileUrl.includes('/image/upload/') ? 'image' : 
                             (document.fileUrl.includes('/video/upload/') ? 'video' : 'raw');

         await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
       }
    } catch (err) {
      console.error('[DocumentController.deleteDocument] Cloudinary deletion error:', err);
    }
    
    await prisma.employeeDocument.delete({
      where: { id: parseInt(id) }
    });
    
    return ok(res, { message: 'Document deleted successfully' });
  } catch (error) {
    console.error('[DocumentController.deleteDocument]', error);
    return fail(res, 'Failed to delete document', 500);
  }
};

const downloadDocument = async (req, res) => {
  try {
    const { id } = req.params;
    const { organizationId } = req.user;
    
    const document = await prisma.employeeDocument.findFirst({
      where: { id: parseInt(id), organizationId }
    });
    
    if (!document) {
      return res.status(404).json({ error: 'Document not found' });
    }
    
    // Cloudinary supports adding fl_attachment to force download
    // Example: https://res.cloudinary.com/demo/image/upload/fl_attachment/sample.jpg
    let downloadUrl = document.fileUrl;
    if (downloadUrl.includes('/upload/')) {
       // Insert fl_attachment after /upload/
       downloadUrl = downloadUrl.replace('/upload/', '/upload/fl_attachment/');
    }
    
    return res.redirect(downloadUrl);
  } catch (error) {
    console.error('[DocumentController.downloadDocument]', error);
    res.status(500).json({ error: 'Failed to download document' });
  }
};

module.exports = {
  getDocuments,
  getDocumentById,
  uploadDocument,
  deleteDocument,
  downloadDocument
};
