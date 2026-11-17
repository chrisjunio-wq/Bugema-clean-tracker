
'use strict';

const {
  requireAuth,
  requireAdmin
} = require('./auth');

const {
  REPORT_STATUSES,
  CLOSED_REPORT_STATUSES
} = require('./helpers');

function registerStats(app, db) {
  const authenticate = requireAuth(db);
  const reports = db.collection('reports');

  const adminOnly = [
    authenticate,
    requireAdmin
  ];

  app.get('/api/stats/summary', ...adminOnly, async (req, res) => {
    try {
      const now = new Date();

      const [
        totalReports,
        openReports,
        urgentReports,
        overdueReports,
        resolvedReports
      ] = await Promise.all([
        reports.countDocuments(),

        reports.countDocuments({
          status: { $in: ['open', 'under-review'] }
        }),

        reports.countDocuments({
          urgency: { $in: ['high', 'critical'] },
          status: { $nin: CLOSED_REPORT_STATUSES }
        }),

        reports.countDocuments({
          status: { $nin: CLOSED_REPORT_STATUSES },
          dueDate: { $lt: now }
        }),

        reports.countDocuments({
          status: 'resolved'
        })
      ]);

      const resolvedRate = totalReports > 0
        ? Number(((resolvedReports / totalReports) * 100).toFixed(1))
        : 0;

      return res.json({
        summary: {
          totalReports,
          openReports,
          urgentReports,
          overdueReports,
          resolvedReports,
          resolvedRate
        }
      });
    } catch (error) {
      console.error('Summary statistics error:', error.message);

      return res.status(500).json({
        error: 'Unable to load summary statistics.'
      });
    }
  });

  app.get('/api/stats/by-status', ...adminOnly, async (req, res) => {
    try {
      const results = await reports.aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 }
          }
        },
        {
          $sort: { count: -1 }
        }
      ]).toArray();

      const counts = new Map(
        results.map(item => [item._id, item.count])
      );

      const data = REPORT_STATUSES.map(status => ({
        status,
        count: counts.get(status) || 0
      }));

      return res.json({ data });
    } catch (error) {
      console.error('Status statistics error:', error.message);

      return res.status(500).json({
        error: 'Unable to load status statistics.'
      });
    }
  });

  app.get('/api/stats/by-location', ...adminOnly, async (req, res) => {
    try {
      const results = await reports.aggregate([
        {
          $group: {
            _id: {
              $ifNull: [
                '$locationName',
                {
                  $ifNull: [
                    '$locationDetails',
                    'Unspecified location'
                  ]
                }
              ]
            },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { count: -1 }
        },
        {
          $limit: 20
        },
        {
          $project: {
            _id: 0,
            location: '$_id',
            count: 1
          }
        }
      ]).toArray();

      return res.json({ data: results });
    } catch (error) {
      console.error('Location statistics error:', error.message);

      return res.status(500).json({
        error: 'Unable to load location statistics.'
      });
    }
  });

  app.get('/api/stats/by-area', ...adminOnly, async (req, res) => {
    try {
      const results = await reports.aggregate([
        {
          $group: {
            _id: {
              $ifNull: ['$locationArea', 'Unspecified area']
            },
            count: { $sum: 1 }
          }
        },
        {
          $sort: { count: -1 }
        },
        {
          $limit: 20
        },
        {
          $project: {
            _id: 0,
            area: '$_id',
            count: 1
          }
        }
      ]).toArray();

      return res.json({ data: results });
    } catch (error) {
      console.error('Area statistics error:', error.message);

      return res.status(500).json({
        error: 'Unable to load area statistics.'
      });
    }
  });
}

module.exports = registerStats;
