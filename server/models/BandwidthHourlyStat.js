const { DataTypes, Model } = require('sequelize')

class BandwidthHourlyStat extends Model {
  constructor(values, options) {
    super(values, options)

    /** @type {number} */
    this.id
    /** @type {string} */
    this.userId
    /** @type {string} */
    this.date
    /** @type {number} */
    this.hour
    /** @type {number} */
    this.bytesStream
    /** @type {number} */
    this.bytesDownload
    /** @type {number} */
    this.bytesOther
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
        hour: {
          type: DataTypes.INTEGER,
          allowNull: false
        },
        bytesStream: {
          type: DataTypes.BIGINT,
          defaultValue: 0
        },
        bytesDownload: {
          type: DataTypes.BIGINT,
          defaultValue: 0
        },
        bytesOther: {
          type: DataTypes.BIGINT,
          defaultValue: 0
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
        modelName: 'bandwidthHourlyStat',
        indexes: [
          {
            unique: true,
            fields: ['userId', 'date', 'hour']
          },
          {
            fields: ['date', 'hour']
          },
          {
            fields: ['date']
          }
        ]
      }
    )
  }
}

module.exports = BandwidthHourlyStat
