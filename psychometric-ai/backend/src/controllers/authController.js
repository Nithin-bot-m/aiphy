// Auth controller — thin HTTP adapter over authService.
const authService = require('../services/auth/authService');
const { asyncHandler } = require('../utils/helpers');

exports.register = asyncHandler(async (req, res) => {
  const result = await authService.register(req);
  res.status(201).json(result);
});

exports.login = asyncHandler(async (req, res) => {
  const result = await authService.login(req);
  res.json(result);
});

exports.sendOtp = asyncHandler(async (req, res) => {
  res.json(await authService.sendOtp(req));
});

exports.verifyOtp = asyncHandler(async (req, res) => {
  res.json(await authService.verifyOtp(req));
});

exports.logout = asyncHandler(async (req, res) => {
  res.json(await authService.logout(req));
});

exports.getMe = asyncHandler(async (req, res) => {
  res.json(await authService.getMe(req));
});
