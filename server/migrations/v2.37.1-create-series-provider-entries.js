/**
 * @typedef MigrationContext
 * @property {import('sequelize').QueryInterface} queryInterface - a sequelize QueryInterface object.
 * @property {import('../Logger')} logger - a Logger object.
 *
 * @typedef MigrationOptions
 * @property {MigrationContext} context - an object containing the migration context.
 */

const migrationVersion = '2.37.1'
const migrationName = `${migrationVersion}-create-series-provider-entries`
const loggerPrefix = `[${migrationVersion} migration]`

const indexes = [
  {
    table: 'seriesProviderEntries',
    name: 'spe_library_entrytype_date',
    fields: ['libraryId', 'entryType', 'releaseDate']
  },
  {
    table: 'seriesProviderEntries',
    name: 'spe_series_entrytype',
    fields: ['seriesId', 'entryType']
  },
  {
    table: 'seriesProviderEntries',
    name: 'spe_asin',
    fields: ['asin']
  }
]

/**
 * Upward migration creates the seriesProviderEntries table and its indexes.
 *
 * @param {MigrationOptions} options - an object containing the migration context.
 * @returns {Promise<void>}
 */
async function up({ context: { queryInterface, logger } }) {
  logger.info(`${loggerPrefix} UPGRADE BEGIN: ${migrationName}`)

  if (await queryInterface.tableExists('seriesProviderEntries')) {
    logger.info(`${loggerPrefix} table "seriesProviderEntries" already exists`)
  } else {
    logger.info(`${loggerPrefix} creating table "seriesProviderEntries"`)
    const DataTypes = queryInterface.sequelize.Sequelize.DataTypes
    await queryInterface.createTable('seriesProviderEntries', {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
      },
      libraryId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: {
            tableName: 'libraries'
          },
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      seriesId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: {
            tableName: 'series'
          },
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      seriesName: {
        type: DataTypes.STRING,
        allowNull: false
      },
      title: {
        type: DataTypes.STRING,
        allowNull: false
      },
      position: {
        type: DataTypes.STRING,
        allowNull: true
      },
      releaseDate: {
        type: DataTypes.STRING,
        allowNull: true
      },
      asin: {
        type: DataTypes.STRING,
        allowNull: true
      },
      coverUrl: {
        type: DataTypes.STRING,
        allowNull: true
      },
      providerUrl: {
        type: DataTypes.STRING,
        allowNull: true
      },
      summary: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      provider: {
        type: DataTypes.STRING,
        allowNull: false,
        defaultValue: 'audible'
      },
      entryType: {
        type: DataTypes.STRING,
        allowNull: false
      },
      isReleased: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
      },
      lastScannedAt: {
        type: DataTypes.BIGINT,
        allowNull: false
      },
      createdAt: {
        type: DataTypes.DATE,
        allowNull: false
      },
      updatedAt: {
        type: DataTypes.DATE,
        allowNull: false
      }
    })
    logger.info(`${loggerPrefix} created table "seriesProviderEntries"`)
  }

  for (const index of indexes) {
    await addIndexIfMissing(queryInterface, logger, index)
  }

  logger.info(`${loggerPrefix} UPGRADE END: ${migrationName}`)
}

/**
 * Downward migration script removes the seriesProviderEntries table.
 *
 * @param {MigrationOptions} options - an object containing the migration context.
 * @returns {Promise<void>}
 */
async function down({ context: { queryInterface, logger } }) {
  logger.info(`${loggerPrefix} DOWNGRADE BEGIN: ${migrationName}`)

  if (await queryInterface.tableExists('seriesProviderEntries')) {
    logger.info(`${loggerPrefix} dropping table "seriesProviderEntries"`)
    await queryInterface.dropTable('seriesProviderEntries')
    logger.info(`${loggerPrefix} dropped table "seriesProviderEntries"`)
  } else {
    logger.info(`${loggerPrefix} table "seriesProviderEntries" does not exist`)
  }

  logger.info(`${loggerPrefix} DOWNGRADE END: ${migrationName}`)
}

async function addIndexIfMissing(queryInterface, logger, index) {
  try {
    const existing = await queryInterface.showIndex(index.table)
    if (existing.some((i) => i.name === index.name)) {
      logger.info(`${loggerPrefix} index ${index.name} already exists on ${index.table}`)
      return
    }

    logger.info(`${loggerPrefix} adding index ${index.name} on ${index.table}(${index.fields.join(', ')})`)
    await queryInterface.addIndex(index.table, {
      name: index.name,
      fields: index.fields
    })
    logger.info(`${loggerPrefix} added index ${index.name}`)
  } catch (err) {
    logger.warn(`${loggerPrefix} failed to check/add index ${index.name} on ${index.table}: ${err.message}`)
  }
}

module.exports = { up, down }
