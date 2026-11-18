// Parent controller — children, link requests, inventory, child dashboard.
const userRepository = require('../repositories/userRepository');
const parentService = require('../services/parentService');
const { asyncHandler, notFound } = require('../utils/helpers');

async function requireParent(req) {
  const parent = await userRepository.findParentByUserId(req.user.id);
  if (!parent) throw notFound('Parent profile not found.');
  return parent;
}

exports.getChildren = asyncHandler(async (req, res) => {
  const parent = await requireParent(req);
  res.json({ children: await userRepository.listChildrenForParent(parent.id) });
});

exports.linkStudent = asyncHandler(async (req, res) => {
  res.status(202).json(await parentService.requestLink(req));
});

exports.submitInventory = asyncHandler(async (req, res) => {
  const parent = await requireParent(req);
  // req.parent/req.assessment attached by requireLinkedParentForAssessment middleware
  const targetParent = req.parent || parent;
  res.json(await parentService.submitInventory(req, targetParent, req.assessment));
});

exports.getChildDashboard = asyncHandler(async (req, res) => {
  const parent = await requireParent(req);
  const targetParent = req.parent || parent;
  res.json(await parentService.getChildDashboard(req, targetParent, req.assessment));
});
