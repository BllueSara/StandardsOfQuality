const express = require('express');
const router  = express.Router({ mergeParams: true });
const {
  getFolders,
  createFolder,
  updateFolder,
  deleteFolder,
  getFolderById,
  getFolderNames,
  addFolderName,
  updateFolderName,
  deleteFolderName
} = require('../controllers/folderController');

// أولاً: routes اسماء المجلدات (ثابتة)
router.get('/folder-names',   getFolderNames);
router.post('/folder-names',  addFolderName);
router.put('/folder-names/:id',   updateFolderName);
router.delete('/folder-names/:id', deleteFolderName);

// بعدين: routes المجلدات العادية
router.get('/',            getFolders);
router.post('/',           createFolder);
router.get('/:folderId',   getFolderById);
router.put('/:folderId',   updateFolder);
router.delete('/:folderId',deleteFolder);

module.exports = router;
