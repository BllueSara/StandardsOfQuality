/**
 * User Utilities
 * Helper functions for user-related operations
 */

/**
 * Builds a full name from individual name parts
 * @param {string} firstName - First name
 * @param {string} secondName - Second name (optional)
 * @param {string} thirdName - Third name (optional)
 * @param {string} lastName - Last name
 * @returns {string} Full name
 */
function buildFullName(firstName, secondName, thirdName, lastName) {
  const nameParts = [firstName, secondName, thirdName, lastName].filter(part => part && part.trim());
  return nameParts.join(' ');
}

/**
 * Builds a full name with job name prefix from individual name parts
 * @param {string} jobName - Job name (e.g., "Eng", "Dr", "Mr")
 * @param {string} firstName - First name
 * @param {string} secondName - Second name (optional)
 * @param {string} thirdName - Third name (optional)
 * @param {string} lastName - Last name
 * @returns {string} Full name with job name prefix
 */
function buildFullNameWithJobName(jobName, firstName, secondName, thirdName, lastName) {
  const nameParts = [firstName, secondName, thirdName, lastName].filter(part => part && part.trim());
  const fullName = nameParts.join(' ');
  return (jobName && typeof jobName === 'string' && jobName.trim()) ? `${jobName} ${fullName}` : fullName;
}

/**
 * SQL CONCAT expression for building full name from database fields
 * @returns {string} SQL CONCAT expression
 */
function getFullNameSQL() {
  return `CONCAT(
    COALESCE(first_name, ''),
    CASE WHEN second_name IS NOT NULL AND second_name != '' THEN CONCAT(' ', second_name) ELSE '' END,
    CASE WHEN third_name IS NOT NULL AND third_name != '' THEN CONCAT(' ', third_name) ELSE '' END,
    CASE WHEN last_name IS NOT NULL AND last_name != '' THEN CONCAT(' ', last_name) ELSE '' END
  )`;
}

/**
 * SQL CONCAT expression for building full name with job name prefix
 * @returns {string} SQL CONCAT expression with job name prefix
 */
function getFullNameWithJobNameSQL() {
  return `CONCAT(
    COALESCE(jn.name, ''),
    CASE WHEN jn.name IS NOT NULL AND jn.name != '' THEN ' ' ELSE '' END,
    COALESCE(first_name, ''),
    CASE WHEN second_name IS NOT NULL AND second_name != '' THEN CONCAT(' ', second_name) ELSE '' END,
    CASE WHEN third_name IS NOT NULL AND third_name != '' THEN CONCAT(' ', third_name) ELSE '' END,
    CASE WHEN last_name IS NOT NULL AND last_name != '' THEN CONCAT(' ', last_name) ELSE '' END
  )`;
}

/**
 * SQL CONCAT expression for building full name with table alias
 * @param {string} tableAlias - Table alias (e.g., 'u', 'u1', 'u2')
 * @returns {string} SQL CONCAT expression with table alias
 */
function getFullNameSQLWithAlias(tableAlias) {
  return `CONCAT(
    COALESCE(${tableAlias}.first_name, ''),
    CASE WHEN ${tableAlias}.second_name IS NOT NULL AND ${tableAlias}.second_name != '' THEN CONCAT(' ', ${tableAlias}.second_name) ELSE '' END,
    CASE WHEN ${tableAlias}.third_name IS NOT NULL AND ${tableAlias}.third_name != '' THEN CONCAT(' ', ${tableAlias}.third_name) ELSE '' END,
    CASE WHEN ${tableAlias}.last_name IS NOT NULL AND ${tableAlias}.last_name != '' THEN CONCAT(' ', ${tableAlias}.last_name) ELSE '' END
  )`;
}

/**
 * SQL CONCAT expression for building full name with job name prefix and table alias
 * @param {string} tableAlias - Table alias (e.g., 'u', 'u1', 'u2')
 * @param {string} jobNameAlias - Job names table alias (e.g., 'jn', 'jn1', 'jn2')
 * @returns {string} SQL CONCAT expression with table alias and job name prefix
 */
function getFullNameWithJobNameSQLWithAlias(tableAlias, jobNameAlias = 'jn') {
  return `CONCAT(
    COALESCE(${jobNameAlias}.name, ''),
    CASE WHEN ${jobNameAlias}.name IS NOT NULL AND ${jobNameAlias}.name != '' THEN ' ' ELSE '' END,
    COALESCE(${tableAlias}.first_name, ''),
    CASE WHEN ${tableAlias}.second_name IS NOT NULL AND ${tableAlias}.second_name != '' THEN CONCAT(' ', ${tableAlias}.second_name) ELSE '' END,
    CASE WHEN ${tableAlias}.third_name IS NOT NULL AND ${tableAlias}.third_name != '' THEN CONCAT(' ', ${tableAlias}.third_name) ELSE '' END,
    CASE WHEN ${tableAlias}.last_name IS NOT NULL AND ${tableAlias}.last_name != '' THEN CONCAT(' ', ${tableAlias}.last_name) ELSE '' END
  )`;
}

/**
 * SQL CONCAT expression for building full name with fallback to username
 * @returns {string} SQL CONCAT expression with username fallback
 */
function getFullNameSQLWithFallback() {
  return `COALESCE(
    NULLIF(TRIM(CONCAT(
      COALESCE(first_name, ''),
      CASE WHEN second_name IS NOT NULL AND second_name != '' THEN CONCAT(' ', second_name) ELSE '' END,
      CASE WHEN third_name IS NOT NULL AND third_name != '' THEN CONCAT(' ', third_name) ELSE '' END,
      CASE WHEN last_name IS NOT NULL AND last_name != '' THEN CONCAT(' ', last_name) ELSE '' END
    )), ''),
    username
  )`;
}

/**
 * SQL CONCAT expression for building full name with job name prefix and fallback to username
 * @returns {string} SQL CONCAT expression with job name prefix and username fallback
 */
function getFullNameWithJobNameSQLWithFallback() {
  return `COALESCE(
    NULLIF(TRIM(CONCAT(
      COALESCE(jn.name, ''),
      CASE WHEN jn.name IS NOT NULL AND jn.name != '' THEN ' ' ELSE '' END,
      COALESCE(first_name, ''),
      CASE WHEN second_name IS NOT NULL AND second_name != '' THEN CONCAT(' ', second_name) ELSE '' END,
      CASE WHEN third_name IS NOT NULL AND third_name != '' THEN CONCAT(' ', third_name) ELSE '' END,
      CASE WHEN last_name IS NOT NULL AND last_name != '' THEN CONCAT(' ', last_name) ELSE '' END
    )), ''),
    username
  )`;
}

/**
 * SQL CONCAT expression for building full name with table alias and fallback to username
 * @param {string} tableAlias - Table alias (e.g., 'u', 'u1', 'u2')
 * @returns {string} SQL CONCAT expression with table alias and username fallback
 */
function getFullNameSQLWithAliasAndFallback(tableAlias) {
  return `COALESCE(
    NULLIF(TRIM(CONCAT(
      COALESCE(${tableAlias}.first_name, ''),
      CASE WHEN ${tableAlias}.second_name IS NOT NULL AND ${tableAlias}.second_name != '' THEN CONCAT(' ', ${tableAlias}.second_name) ELSE '' END,
      CASE WHEN ${tableAlias}.third_name IS NOT NULL AND ${tableAlias}.third_name != '' THEN CONCAT(' ', ${tableAlias}.third_name) ELSE '' END,
      CASE WHEN ${tableAlias}.last_name IS NOT NULL AND ${tableAlias}.last_name != '' THEN CONCAT(' ', ${tableAlias}.last_name) ELSE '' END
    )), ''),
    ${tableAlias}.username
  )`;
}

/**
 * SQL CONCAT expression for building full name with job name prefix, table alias and fallback to username
 * @param {string} tableAlias - Table alias (e.g., 'u', 'u1', 'u2')
 * @param {string} jobNameAlias - Job names table alias (e.g., 'jn', 'jn1', 'jn2')
 * @returns {string} SQL CONCAT expression with job name prefix, table alias and username fallback
 */
function getFullNameWithJobNameSQLWithAliasAndFallback(tableAlias, jobNameAlias = 'jn') {
  return `COALESCE(
    NULLIF(TRIM(CONCAT(
      COALESCE(${jobNameAlias}.name, ''),
      CASE WHEN ${jobNameAlias}.name IS NOT NULL AND ${jobNameAlias}.name != '' THEN ' ' ELSE '' END,
      COALESCE(${tableAlias}.first_name, ''),
      CASE WHEN ${tableAlias}.second_name IS NOT NULL AND ${tableAlias}.second_name != '' THEN CONCAT(' ', ${tableAlias}.second_name) ELSE '' END,
      CASE WHEN ${tableAlias}.third_name IS NOT NULL AND ${tableAlias}.third_name != '' THEN CONCAT(' ', ${tableAlias}.third_name) ELSE '' END,
      CASE WHEN ${tableAlias}.last_name IS NOT NULL AND ${tableAlias}.last_name != '' THEN CONCAT(' ', ${tableAlias}.last_name) ELSE '' END
    )), ''),
    ${tableAlias}.username
  )`;
}

module.exports = {
  buildFullName,
  buildFullNameWithJobName,
  getFullNameSQL,
  getFullNameWithJobNameSQL,
  getFullNameSQLWithAlias,
  getFullNameWithJobNameSQLWithAlias,
  getFullNameSQLWithFallback,
  getFullNameWithJobNameSQLWithFallback,
  getFullNameSQLWithAliasAndFallback,
  getFullNameWithJobNameSQLWithAliasAndFallback
}; 