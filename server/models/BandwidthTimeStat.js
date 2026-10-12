const { DataTypes, Model } = require('sequelize')

class BandwidthTimeStat extends Model {
  constructor(values, options) {
    super(values, options)

    /** @type {number} */
    this.id
    /** @type {string} */
    this.userId
    /** @type {number} */
    this.bucketTime
    /** @type {string} */
    this.timeLabel
    /** @type {string} */
    this.date
    /** @type {number} */
    this.hour
    /** @type {number} */
    this.minute
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
        bucketTime: {
          type: DataTypes.BIGINT,
          allowNull: false
        },
        timeLabel: {
          type: DataTypes.STRING,
          allowNull: false
        },
        date: {
          type: DataTypes.STRING,
          allowNull: false
        },
        hour: {
          type: DataTypes.INTEGER,
          allowNull: false
        },
        minute: {
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
        modelName: 'bandwidthTimeStat',
        indexes: [
          {
            unique: true,
            fields: ['userId', 'timeLabel']
          },
          {
            fields: ['bucketTime']
          },
          {
            fields: ['date', 'hour']
          }
        ]
      }
    )
  }
}

module.exports = BandwidthTimeStat
