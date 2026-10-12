const { DataTypes, Model } = require('sequelize')

class BandwidthItemStat extends Model {
  constructor(values, options) {
    super(values, options)

    /** @type {number} */
    this.id
    /** @type {string} */
    this.userId
    /** @type {string} */
    this.date
    /** @type {string} */
    this.libraryItemId
    /** @type {string} */
    this.itemName
    /** @type {string} */
    this.category
    /** @type {number} */
    this.bytesLocal
    /** @type {number} */
    this.bytesInternet
    /** @type {number} */
    this.bytesTotal
    /** @type {number} */
    this.requests
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
          type: DataTypes.INTEGER,
          primaryKey: true,
          autoIncrement: true
        },
        userId: {
          type: DataTypes.STRING,
          allowNull: false,
          defaultValue: 'anonymous'
        },
        date: {
          type: DataTypes.STRING,
          allowNull: false
        },
        libraryItemId: {
          type: DataTypes.STRING,
          allowNull: false,
          defaultValue: 'general'
        },
        itemName: {
          type: DataTypes.STRING,
          allowNull: true
        },
        category: {
          type: DataTypes.STRING,
          allowNull: false,
          defaultValue: 'other'
        },
        bytesLocal: {
          type: DataTypes.BIGINT,
          defaultValue: 0
        },
        bytesInternet: {
          type: DataTypes.BIGINT,
          defaultValue: 0
        },
        bytesTotal: {
          type: DataTypes.BIGINT,
          defaultValue: 0
        },
        requests: {
          type: DataTypes.INTEGER,
          defaultValue: 0
        }
      },
      {
        sequelize,
        modelName: 'bandwidthItemStat',
        indexes: [
          {
            unique: true,
            fields: ['userId', 'date', 'libraryItemId', 'category']
          },
          {
            fields: ['userId', 'date']
          },
          {
            fields: ['date']
          }
        ]
      }
    )
  }
}

module.exports = BandwidthItemStat
