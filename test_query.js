const Database = require('./server/Database')
const path = require('path')

async function test() {
  await Database.init()
  // Mock user and library
  const userId = 'user123'
  const libraryId = 'lib123'
  const user = { id: userId, permissions: {} }
  const limit = 10

  const userPermissionBookWhere = {
    bookWhere: {},
    replacements: { userId }
  }

  try {
    const seriesNotStarted = await Database.seriesModel.findAll({
      where: [
        { libraryId },
        Database.sequelize.where(Database.sequelize.literal(`(SELECT count(*) FROM bookSeries bs WHERE bs.seriesId = series.id AND (SELECT count(*) FROM mediaProgresses mp WHERE mp.mediaItemId = bs.bookId AND mp.userId = :userId AND (mp.isFinished = 1 OR mp.currentTime > 0)) = 0)`), {
          [Database.sequelize.Op.gt]: 0
        })
      ],
      replacements: {
        userId: user.id,
        ...userPermissionBookWhere.replacements
      },
      attributes: ['id'],
      include: {
        model: Database.bookSeriesModel,
        attributes: ['bookId', 'sequence'],
        separate: true,
        required: true,
        where: [
          Database.sequelize.where(Database.sequelize.literal(`(SELECT count(*) FROM mediaProgresses mp WHERE mp.mediaItemId = bookSeries.bookId AND mp.userId = :userId AND (mp.isFinished = 1 OR mp.currentTime > 0))`), 0)
        ],
        order: [[Database.sequelize.literal('CAST(sequence AS FLOAT) ASC NULLS LAST')]],
        limit: 1
      },
      subQuery: false,
      limit,
      order: Database.sequelize.random()
    })
    console.log("Success:", seriesNotStarted)
  } catch (err) {
    console.error("Error:", err.message)
  }
}
test()
