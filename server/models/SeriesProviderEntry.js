const { DataTypes, Model } = require('sequelize')

/**
 * @typedef SeriesProviderEntryObject
 * @property {UUIDV4} id
 * @property {UUIDV4} libraryId
 * @property {UUIDV4} seriesId
 * @property {string} seriesName
 * @property {string} title
 * @property {string} [position]
 * @property {string} [releaseDate]
 * @property {string} [asin]
 * @property {string} [coverUrl]
 * @property {string} [providerUrl]
 * @property {string} [summary]
 * @property {string} provider
 * @property {string} entryType
 * @property {boolean} isReleased
 * @property {number} lastScannedAt
 * @property {Date} createdAt
 * @property {Date} updatedAt
 *
 * @typedef {SeriesProviderEntryObject & SeriesProviderEntry} SeriesProviderEntryModel
 */

class SeriesProviderEntry extends Model {
  constructor(values, options) {
    super(values, options)

    /** @type {UUIDV4} */
    this.id
    /** @type {UUIDV4} */
    this.libraryId
    /** @type {UUIDV4} */
    this.seriesId
    /** @type {string} */
    this.seriesName
    /** @type {string} */
    this.title
    /** @type {string} */
    this.position
    /** @type {string} */
    this.releaseDate
    /** @type {string} */
    this.asin
    /** @type {string} */
    this.coverUrl
    /** @type {string} */
    this.providerUrl
    /** @type {string} */
    this.summary
    /** @type {string} */
    this.provider
    /** @type {string} */
    this.entryType
    /** @type {boolean} */
    this.isReleased
    /** @type {number} */
    this.lastScannedAt
    /** @type {Date} */
    this.createdAt
    /** @type {Date} */
    this.updatedAt
  }

  /**
   * Initialize model
   * @param {import('../Database').sequelize} sequelize
   */
  static init(sequelize) {
    super.init(
      {
        id: {
          type: DataTypes.UUID,
          defaultValue: DataTypes.UUIDV4,
          primaryKey: true
        },
        libraryId: {
          type: DataTypes.UUID,
          allowNull: false
        },
        seriesId: {
          type: DataTypes.UUID,
          allowNull: false
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
          defaultValue: 'audible',
          allowNull: false
        },
        entryType: {
          type: DataTypes.STRING, // 'upcoming' | 'missing'
          allowNull: false
        },
        isReleased: {
          type: DataTypes.BOOLEAN,
          defaultValue: false
        },
        lastScannedAt: {
          type: DataTypes.BIGINT,
          allowNull: false
        }
      },
      {
        sequelize,
        modelName: 'seriesProviderEntry',
        tableName: 'seriesProviderEntries',
        indexes: [
          {
            name: 'spe_library_entrytype_date',
            fields: ['libraryId', 'entryType', 'releaseDate']
          },
          {
            name: 'spe_series_entrytype',
            fields: ['seriesId', 'entryType']
          },
          {
            name: 'spe_asin',
            fields: ['asin']
          }
        ]
      }
    )

    const { library, series } = sequelize.models
    if (library) {
      library.hasMany(SeriesProviderEntry, {
        foreignKey: 'libraryId',
        onDelete: 'CASCADE'
      })
      SeriesProviderEntry.belongsTo(library, { foreignKey: 'libraryId' })
    }

    if (series) {
      series.hasMany(SeriesProviderEntry, {
        foreignKey: 'seriesId',
        onDelete: 'CASCADE'
      })
      SeriesProviderEntry.belongsTo(series, { foreignKey: 'seriesId' })
    }
  }

  toJSON() {
    return {
      id: this.id,
      libraryId: this.libraryId,
      seriesId: this.seriesId,
      seriesName: this.seriesName,
      title: this.title,
      position: this.position,
      releaseDate: this.releaseDate,
      asin: this.asin,
      coverUrl: this.coverUrl,
      providerUrl: this.providerUrl,
      summary: this.summary,
      provider: this.provider,
      entryType: this.entryType,
      isReleased: this.isReleased,
      lastScannedAt: Number(this.lastScannedAt),
      createdAt: this.createdAt ? this.createdAt.valueOf() : null,
      updatedAt: this.updatedAt ? this.updatedAt.valueOf() : null
    }
  }
}

module.exports = SeriesProviderEntry
