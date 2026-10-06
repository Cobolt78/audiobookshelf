const { DataTypes, Model } = require('sequelize')

class BandwidthStat extends Model {
  constructor(values, options) {
    super(values, options)

    /** @type {number} */
    this.id
    /** @type {string} */
    this.userId
    /** @type {string} */
    this.date
    /** @type {number} */
    this.bytesStream
    /** @type {number} */
    this.bytesDownload
    /** @type {number} */
    this.bytesOther
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
        modelName: 'bandwidthStat',
        indexes: [
          {
            unique: true,
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

module.exports = BandwidthStat
