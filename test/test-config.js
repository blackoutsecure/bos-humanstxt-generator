/**
 * Centralized test configuration for the humans.txt-only action.
 */

const path = require('path');

const TEST_CONFIG = {
  PUBLIC_DIR: 'dist',
  HUMANS_TXT: 'humans.txt',
  HUMANS_GENERATION: {
    TEAM_NAME: 'Development Team',
    TEAM_TITLE: 'Full Stack Developers',
    TEAM_CONTACT: 'dev@example.com',
    TEAM_LOCATION: 'San Francisco, CA',
    THANKS_NAME: 'Open Source Community',
    THANKS_URL: 'https://github.com',
    SITE_STANDARDS: 'HTML5, CSS3',
    SITE_COMPONENTS: 'React, Alpine.js',
    SITE_SOFTWARE: 'Node.js, Webpack',
    SITE_LANGUAGE: 'English',
    SITE_DOCTYPE: 'HTML5',
    COMMENTS: true,
  },
};

function getAbsolutePath(dir) {
  return path.join(__dirname, '..', dir);
}

function getPublicFilePath(filename) {
  return path.join(__dirname, '..', TEST_CONFIG.PUBLIC_DIR, filename);
}

module.exports = {
  TEST_CONFIG,
  getAbsolutePath,
  getPublicFilePath,
};
