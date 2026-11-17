
const { requireAuth, requireAdmin } = require('./auth');

module.exports = function (app, db) {
  const adminOnly = [
    requireAuth(db),
    requireAdmin
  ];

  const reports = db.collection('reports');
  const logs = db.collection('collectionLogs');

  // SUMMARY STATISTICS
  app.get('/api/stats/summary', ...adminOnly, async (req, res) => {
    try {
      const [
        totalReports,
        openReports,
        urgentUnresolved,
        missedCollections,
        resolvedReports,
        overdueReports
      ] = await Promise.all([
        reports.countDocuments(),

        reports.countDocuments({
          status: 'open'
        }),

        reports.countDocuments({
          urgency: 'High',
          status: { $ne: 'resolved' }
        }),

        logs.countDocuments({
          status: 'missed'
        }),

        reports.countDocuments({
          status: 'resolved'
        }),

        reports.countDocuments({
          status: { $ne: 'resolved' },
          reportedAt: {
            $lt: new Date(Date.now() - 72 * 60 * 60 * 1000)
          }
        })
      ]);

      return res.json({
        totalReports,
        openReports,
        urgentUnresolved,
        missedCollections,
        resolvedReports,
        overdueReports,
        resolvedRate: totalReports
          ? Math.round((resolvedReports / totalReports) * 100)
          : 0
      });

    } catch (error) {
      console.error('Summary statistics error:', error);

      return res.status(500).json({
        error: 'Could not load summary statistics'
      });
    }
  });

  // REPORTS BY STATUS
  app.get('/api/stats/by-status', ...adminOnly, async (req, res) => {
    try {
      const result = await reports.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ]).toArray();

      return res.json(result);

    } catch (error) {
      console.error('Status statistics error:', error);

      return res.status(500).json({
        error: 'Could not load status statistics'
      });
    }
  });
// REPORTS BY LOCATION
app.get('/api/stats/by-location', ...adminOnly, async (req, res) => {
  try {
    const result = await reports.aggregate([
      {
        $lookup: {
          from: 'locations',
          localField: 'locationId',
          foreignField: '_id',
          as: 'location'
        }
      },
      {
        $unwind: {
          path: '$location',
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $group: {
          _id: {
            name: {
              $ifNull: ['$locationDetails', '$location.name']
            },
            area: {
              $ifNull: [
                '$location.area',
                {
                  $cond: [
                    { $eq: ['$locationType', 'University / Campus'] },
                    'Campus',
                    'Village'
                  ]
                }
              ]
            }
          },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: 0,
          locationName: {
            $ifNull: ['$_id.name', 'Unknown location']
          },
          area: {
            $ifNull: ['$_id.area', 'Unspecified']
          },
          count: 1
        }
      },
      {
        $sort: { count: -1 }
      }
    ]).toArray();

    return res.json(result);

  } catch (error) {
    console.error('Location statistics error:', error);

    return res.status(500).json({
      error: 'Could not load location statistics'
    });
  }
});
  // REPORTS BY SERVICE AREA
  app.get('/api/stats/by-area', ...adminOnly, async (req, res) => {
    try {
      const result = await reports.aggregate([
        {
          $lookup: {
            from: 'locations',
            localField: 'locationId',
            foreignField: '_id',
            as: 'location'
          }
        },
        {
          $unwind: {
            path: '$location',
            preserveNullAndEmptyArrays: true
          }
        },
        {
          $group: {
            _id: {
                            $switch: {
                branches: [
                  {
                    case: { $eq: ['$locationType', 'University / Campus'] },
                    then: 'Campus'
                  },
                  {
                    case: { $in: ['$locationType', ['Resident', 'Market', 'Trading Centre', 'Roadside / Service Area']] },
                    then: 'Village'
                  }
                ],
                default: '$location.area'
              }
            },
                        count: { $sum: 1 },
            unresolved: {
              $sum: {
                $cond: [{ $ne: ['$status', 'resolved'] }, 1, 0]
              }
            }
          }
        },
        {
          $project: {
            _id: 0,
            area: {
              $ifNull: ['$_id', 'Unspecified']
            },
                        count: 1,
            unresolved: 1
          }
        },
        {
          $sort: { area: 1 }
        }
      ]).toArray();

      // Keep the response compatible with the dashboard's
      // existing expectation of _id and count.
      return res.json(result.map(item => ({
        _id: item.area,
        count: item.count,
        unresolved: item.unresolved
      })));

    } catch (error) {
      console.error('Service area statistics error:', error);

      return res.status(500).json({
        error: 'Could not load service area statistics'
      });
    }
  });
};
