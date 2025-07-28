const express = require('express');
const router  = express.Router();
const {
  getUserPendingApprovals,
  handleApproval,
  getAssignedApprovals,
  delegateApproval,
  getProxyApprovals,
  acceptProxyDelegation,
  delegateAllApprovals,
  revokeAllDelegations,
  getDelegationSummaryByUser,
  processBulkDelegation,
  getDelegationStatus,
  getPendingDelegationsUnified,
  getDelegationLogs,
  processDirectDelegationUnified,
  processBulkDelegationUnified
} = require('../controllers/approvalController');

router.get('/', getUserPendingApprovals);
router.post('/:contentId/approve', handleApproval);
router.get('/assigned-to-me', getAssignedApprovals);
router.post('/:id/delegate', delegateApproval);
router.post('/delegate-all', delegateAllApprovals);
router.post('/bulk-delegation/process', processBulkDelegation);
router.get('/proxy', getProxyApprovals);
router.post('/proxy/accept/:id', acceptProxyDelegation);
router.delete('/delegations/by-user/:userId', revokeAllDelegations);
router.get('/delegation-summary/:userId', getDelegationSummaryByUser);

// المسارات الجديدة للتفويض الموحد
router.get('/pending-delegations-unified/:userId', getPendingDelegationsUnified);
router.post('/direct-delegation-unified/process', processDirectDelegationUnified);
router.post('/bulk-delegation-unified/process', processBulkDelegationUnified);
router.get('/delegation-status/:userId', getDelegationStatus);
router.get('/delegation-logs/:userId/:delegatorId', getDelegationLogs);

module.exports = router;
