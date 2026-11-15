/**
 * @typedef MigrationContext
 * @property {import('sequelize').QueryInterface} queryInterface - a sequelize QueryInterface object.
 * @property {import('../Logger')} logger - a Logger object.
 *
 * @typedef MigrationOptions
 * @property {MigrationContext} context - an object containing the migration context.
 */

const migrationVersion = '2.37.3'
const migrationName = `${migrationVersion}-add-author-narrator-to-series-provider-entries`
const loggerPrefix = `[${migrationVersion} migration]`

/**
 * Upward migration adds author and narrator columns to seriesProviderEntries.
 *
 * @param {MigrationOptions} options - an object containing the migration context.
 * @returns {Promise<void>}
 */
async function up({ context: { queryInterface, logger } }) {
  logger.info(`${loggerPrefix} UPGRADE BEGIN: ${migrationName}`)

  if (await queryInterface.tableExists('seriesProviderEntries')) {
    const table = await queryInterface.describeTable('seriesProviderEntries')
    const DataTypes = queryInterface.sequelize.Sequelize.DataTypes

    if (!table.author) {
      logger.info(`${loggerPrefix} adding column "author" to "seriesProviderEntries"`)
      await queryInterface.addColumn('seriesProviderEntries', 'author', {
        type: DataTypes.TEXT,
        allowNull: true
      })
      logger.info(`${loggerPrefix} added column "author" to "seriesProviderEntries"`)
    } else {
      logger.info(`${loggerPrefix} column "author" already exists on "seriesProviderEntries"`)
    }

    if (!table.narrator) {
      logger.info(`${loggerPrefix} adding column "narrator" to "seriesProviderEntries"`)
      await queryInterface.addColumn('seriesProviderEntries', 'narrator', {
        type: DataTypes.TEXT,
        allowNull: true
      })
      logger.info(`${loggerPrefix} added column "narrator" to "seriesProviderEntries"`)
    } else {
      logger.info(`${loggerPrefix} column "narrator" already exists on "seriesProviderEntries"`)
    }
  } else {
    logger.info(`${loggerPrefix} table "seriesProviderEntries" does not exist`)
  }

  logger.info(`${loggerPrefix} UPGRADE END: ${migrationName}`)
}

/**
 * Downward migration script removes author and narrator columns.
 *
 * @param {MigrationOptions} options - an object containing the migration context.
 * @returns {Promise<void>}
 */
async function down({ context: { queryInterface, logger } }) {
  logger.info(`${loggerPrefix} DOWNGRADE BEGIN: ${migrationName}`)

  if (await queryInterface.tableExists('seriesProviderEntries')) {
    const table = await queryInterface.describeTable('seriesProviderEntries')
    if (table.author) {
      logger.info(`${loggerPrefix} removing column "author" from "seriesProviderEntries"`)
      await queryInterface.removeColumn('seriesProviderEntries', 'author')
      logger.info(`${loggerPrefix} removed column "author" from "seriesProviderEntries"`)
    }
    if (table.narrator) {
      logger.info(`${loggerPrefix} removing column "narrator" from "seriesProviderEntries"`)
      await queryInterface.removeColumn('seriesProviderEntries', 'narrator')
      logger.info(`${loggerPrefix} removed column "narrator" from "seriesProviderEntries"`)
    }
  } else {
    logger.info(`${loggerPrefix} table "seriesProviderEntries" does not exist`)
  }

  logger.info(`${loggerPrefix} DOWNGRADE END: ${migrationName}`)
}

module.exports = { up, down }
