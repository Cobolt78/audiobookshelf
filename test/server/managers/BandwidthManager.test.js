const { expect } = require('chai')
const { Sequelize } = require('sequelize')

const Database = require('../../../server/Database')
const BandwidthManager = require('../../../server/managers/BandwidthManager')

describe('BandwidthManager getStats Date Filtering', () => {
  let sequelize
  let bandwidthManager
  let userA
  let userB

  beforeEach(async () => {
    global.ServerSettings = {
      enableBandwidthTracking: true
    }
    sequelize = new Sequelize({ dialect: 'sqlite', storage: ':memory:', logging: false })
    sequelize.uppercaseFirst = (str) => (str ? `${str[0].toUpperCase()}${str.substr(1)}` : '')
    Database.sequelize = sequelize
    await Database.buildModels()

    userA = await Database.userModel.create({
      id: 'user-a',
      username: 'Alice',
      type: 'user'
    })

    userB = await Database.userModel.create({
      id: 'user-b',
      username: 'Bob',
      type: 'user'
    })

    // Create bandwidth stats for Alice and Bob on two consecutive days
    const date1 = '2026-11-11'
    const date2 = '2026-11-12'

    // Date 1: Alice has 1000 bytes, Bob has 3000 bytes. Total = 4000 bytes (Alice 25%, Bob 75%)
    await Database.bandwidthStatModel.create({
      userId: userA.id,
      date: date1,
      bytesStream: 1000,
      bytesDownload: 0,
      bytesOther: 0,
      bytesTotal: 1000,
      bytesLocal: 500,
      bytesInternet: 500,
      requests: 5
    })

    await Database.bandwidthStatModel.create({
      userId: userB.id,
      date: date1,
      bytesStream: 0,
      bytesDownload: 3000,
      bytesOther: 0,
      bytesTotal: 3000,
      bytesLocal: 1500,
      bytesInternet: 1500,
      requests: 2
    })

    // Date 2: Alice has 8000 bytes, Bob has 2000 bytes. Total = 10000 bytes (Alice 80%, Bob 20%)
    await Database.bandwidthStatModel.create({
      userId: userA.id,
      date: date2,
      bytesStream: 8000,
      bytesDownload: 0,
      bytesOther: 0,
      bytesTotal: 8000,
      bytesLocal: 4000,
      bytesInternet: 4000,
      requests: 12
    })

    await Database.bandwidthStatModel.create({
      userId: userB.id,
      date: date2,
      bytesStream: 1000,
      bytesDownload: 1000,
      bytesOther: 0,
      bytesTotal: 2000,
      bytesLocal: 1000,
      bytesInternet: 1000,
      requests: 4
    })

    bandwidthManager = new BandwidthManager({
      playbackSessionManager: { getSession: () => null }
    })
  })

  afterEach(async () => {
    if (bandwidthManager) {
      await bandwidthManager.stop()
    }
    if (sequelize) {
      await sequelize.close()
    }
  })

  it('returns combined user breakdown across full range when no date filter is specified', async () => {
    const stats = await bandwidthManager.getStats({
      startDate: '2026-11-10',
      endDate: '2026-11-13'
    })

    expect(stats.daily).to.have.lengthOf(2)
    expect(stats.rangeTotalBytes).to.equal(14000)

    const alice = stats.userBreakdown.find((u) => u.userId === 'user-a')
    const bob = stats.userBreakdown.find((u) => u.userId === 'user-b')

    expect(alice).to.exist
    expect(bob).to.exist
    expect(alice.bytesTotal).to.equal(9000)
    expect(bob.bytesTotal).to.equal(5000)
    expect(alice.percentOfTotal).to.equal(64.3)
    expect(bob.percentOfTotal).to.equal(35.7)
  })

  it('filters user breakdown strictly to selected date when date parameter is provided', async () => {
    // When date 2026-11-11 is selected:
    const stats1 = await bandwidthManager.getStats({
      startDate: '2026-11-10',
      endDate: '2026-11-13',
      date: '2026-11-11'
    })

    // Timeline chart daily bars must remain populated for the range
    expect(stats1.daily).to.have.lengthOf(2)
    expect(stats1.rangeTotalBytes).to.equal(14000)
    expect(stats1.breakdownTotalBytes).to.equal(4000)

    // User breakdown MUST change to reflect 2026-11-11 only!
    const aliceDay1 = stats1.userBreakdown.find((u) => u.userId === 'user-a')
    const bobDay1 = stats1.userBreakdown.find((u) => u.userId === 'user-b')

    expect(aliceDay1.bytesTotal).to.equal(1000)
    expect(bobDay1.bytesTotal).to.equal(3000)
    expect(aliceDay1.percentOfTotal).to.equal(25)
    expect(bobDay1.percentOfTotal).to.equal(75)

    // When date 2026-11-12 is selected:
    const stats2 = await bandwidthManager.getStats({
      startDate: '2026-11-10',
      endDate: '2026-11-13',
      date: '2026-11-12'
    })

    expect(stats2.daily).to.have.lengthOf(2)
    expect(stats2.rangeTotalBytes).to.equal(14000)
    expect(stats2.breakdownTotalBytes).to.equal(10000)

    // User breakdown MUST change to reflect 2026-11-12 only!
    const aliceDay2 = stats2.userBreakdown.find((u) => u.userId === 'user-a')
    const bobDay2 = stats2.userBreakdown.find((u) => u.userId === 'user-b')

    expect(aliceDay2.bytesTotal).to.equal(8000)
    expect(bobDay2.bytesTotal).to.equal(2000)
    expect(aliceDay2.percentOfTotal).to.equal(80)
    expect(bobDay2.percentOfTotal).to.equal(20)
  })

  it('respects trafficType filter on selected date breakdown', async () => {
    // When date 2026-11-12 is selected with internet traffic only:
    // Alice has 4000 internet bytes, Bob has 1000 internet bytes. Total internet = 5000.
    const statsInternet = await bandwidthManager.getStats({
      startDate: '2026-11-10',
      endDate: '2026-11-13',
      date: '2026-11-12',
      trafficType: 'internet'
    })

    expect(statsInternet.breakdownTotalBytes).to.equal(5000)
    const aliceInternet = statsInternet.userBreakdown.find((u) => u.userId === 'user-a')
    const bobInternet = statsInternet.userBreakdown.find((u) => u.userId === 'user-b')

    expect(aliceInternet.bytesInternet).to.equal(4000)
    expect(bobInternet.bytesInternet).to.equal(1000)
    expect(aliceInternet.percentOfTotal).to.equal(80)
    expect(bobInternet.percentOfTotal).to.equal(20)
  })

  it('returns empty user breakdown for date with no traffic records', async () => {
    const statsEmpty = await bandwidthManager.getStats({
      startDate: '2026-11-10',
      endDate: '2026-11-13',
      date: '2026-11-10'
    })

    expect(statsEmpty.userBreakdown).to.be.an('array').that.is.empty
    expect(statsEmpty.breakdownTotalBytes).to.equal(0)
  })
})
