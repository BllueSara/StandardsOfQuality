const express = require('express');
const router  = express.Router();
const {
  getUserPendingApprovals,
  handleApproval,
  getAssignedApprovals,
  delegateApproval,
  getProxyApprovals,
  acceptProxyDelegation
} = require('../controllers/approvalController');



router.get('/', getUserPendingApprovals);
router.post('/:contentId/approve', handleApproval);
router.get('/assigned-to-me', getAssignedApprovals);
router.post('/:id/delegate', delegateApproval);
router.post('/delegate-all', require('../controllers/approvalController').delegateAllApprovals);
router.post('/bulk-delegation/process', require('../controllers/approvalController').processBulkDelegation);
router.get('/proxy', getProxyApprovals);
router.post('/proxy/accept/:id', acceptProxyDelegation);
router.delete('/delegations/by-user/:userId', require('../controllers/approvalController').revokeAllDelegations);
router.get('/delegation-summary/:userId', require('../controllers/approvalController').getDelegationSummaryByUser);

module.exports = router;
