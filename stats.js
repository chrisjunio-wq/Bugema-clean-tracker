
const { requireAuth, requireAdmin } = require('./auth');

module.exports = function (app, db) {
  const adminOnly = [
    requireAuth(db),
    requireAdmin
  ];

  // SUMMARY STATISTICS
  app.get('/api/stats/summary', ...adminOnly, async (req, res) => {
    try {
      const reports = db.collection('reports');
      const logs = db.collection('collectionLogs');

      const [
        totalReports,
        openReports,
        urgentUnresolved,
        missedCollections,
        resolvedReports
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
        })
      ]);

      return res.json({
        totalReports,
        openReports,
        urgentUnresolved,
        missedCollections,
        resolvedReports
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
      const result = await db.collection('reports').aggregate([
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
      const result = await db.collection('reports').aggregate([
        {
          $lookup: {
            from: 'locations',
            localField: 'locationId',
            foreignField: '_id',
            as: 'location'
          }
        },
        {
          $group: {
            _id: {
              $ifNull: [
                { $arrayElemAt: ['$location._id', 0] },
                {
                  $concat: [
                    'custom:',
                    { $ifNull: ['$locationName', 'Unknown location'] }
                  ]
                }
              ]
            },
            locationId: { $first: '$locationId' },
            locationName: {
              $first: {
                $ifNull: [
                  { $arrayElemAt: ['$location.name', 0] },
                  { $ifNull: ['$locationName', 'Unknown location'] }
                ]
              }
            },
            area: {
              $first: {
                $ifNull: [
                  { $arrayElemAt: ['$location.area', 0] },
                  { $ifNull: ['$area', 'Unknown area'] }
                ]
              }
            },
            count: { $sum: 1 }
          }
        },
        {
          $project: {
            _id: 0,
            locationId: 1,
            locationName: 1,
            area: 1,
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

  // REPORTS BY AREA
  app.get('/api/stats/by-area', ...adminOnly, async (req, res) => {
    try {
      const result = await db.collection('reports').aggregate([
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
              $ifNull: [
                '$location.area',
                { $ifNull: ['$area', 'Unknown area'] }
              ]
            },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { _id: 1 }
        }
      ]).toArray();

      return res.json(result);

    } catch (error) {
      console.error('Area statistics error:', error);

      return res.status(500).json({
        error: 'Could not load area statistics'
      });
    }
  });
};
