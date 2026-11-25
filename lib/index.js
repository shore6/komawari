'use strict';
// Programmatic API: the same engine the CLI uses.
//   const kw = require('komawari');
//   kw.newProject({ size: 'B5' }); await kw.runOps([...]); kw.saveProject('a.manga.json');
const E = require('./engine');
const OPS = require('./ops');
const { info } = require('./info');
module.exports = {
  core: E.K,
  newProject: E.newProject,
  loadProject: E.loadProject,
  saveProject: E.saveProject,
  importImage: E.importImage,
  renderPages: E.renderPages,
  runOps: OPS.runOps,
  specToOps: OPS.specToOps,
  validateOps: OPS.validateOps,
  info,
  fonts: E.fonts,
};
