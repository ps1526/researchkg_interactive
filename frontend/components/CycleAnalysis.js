import React from 'react';

const CycleAnalysis = ({ cycleAnalysis, onToggleCycles, showCycles }) => {
  if (!cycleAnalysis) {
    return (
      <div className="p-6 text-gray-500 text-center bg-gray-50 rounded-md">
        <svg className="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
        </svg>
        <p className="font-medium">No cycle data available</p>
        <p className="text-sm mt-2 text-gray-400">Cycle analysis requires an API with cycle detection enabled</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-md overflow-hidden">
      <div className="px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
        <h2 className="text-lg font-semibold">Citation Cycle Analysis</h2>
        <p className="text-sm opacity-80">Exploring circular citation patterns</p>
      </div>
      
      <div className="p-4">
        <div className="flex items-center justify-between p-3 mb-4 bg-blue-50 border-l-4 border-blue-500 rounded-r-md">
          <div>
            <p className="text-sm text-blue-800 font-medium">
              {cycleAnalysis.count || 0} citation cycles detected
            </p>
            <p className="text-xs text-blue-600 mt-1">
              Cycles represent papers that form citation loops
            </p>
          </div>
          <div className="flex-shrink-0 p-1 bg-blue-100 rounded-full shadow-inner">
          </div>
        </div>
        
        {cycleAnalysis.count > 0 && (
          <>
            <div className="bg-gray-50 p-4 rounded-md mb-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-medium text-gray-700">Length Distribution</h3>
                <span className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded-full">
                  Avg: {cycleAnalysis.avg_length?.toFixed(1) || 0}
                </span>
              </div>
              <div className="grid grid-cols-4 gap-3 text-xs">
                {Object.entries(cycleAnalysis.length_distribution || {}).map(([length, count]) => (
                  <div key={length} 
                    className="text-center bg-white p-2 rounded-md shadow-sm border border-gray-100 hover:shadow-md transition-shadow duration-200">
                    <div className="text-lg font-bold text-blue-700">
                      {count}
                    </div>
                    <div className="text-gray-500 mt-1">
                      {length}-paper cycles
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="bg-gray-50 p-4 rounded-md mb-4 shadow-sm">
              <h3 className="font-medium text-gray-700 mb-3">Cycle Types</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white p-3 rounded-md shadow-sm border border-gray-100 hover:shadow-md transition-shadow duration-200">
                  <div className="flex items-center justify-between">
                    <p className="text-gray-500 text-xs">Chronological</p>
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full">
                      Time-ordered
                    </span>
                  </div>
                  <p className="font-bold text-xl text-green-600 mt-1">
                    {cycleAnalysis.chronological_cycles || 0}
                  </p>
                </div>
                <div className="bg-white p-3 rounded-md shadow-sm border border-gray-100 hover:shadow-md transition-shadow duration-200">
                  <div className="flex items-center justify-between">
                    <p className="text-gray-500 text-xs">Reversed</p>
                    <span className="text-xs px-2 py-0.5 bg-amber-100 text-amber-700 rounded-full">
                      Back-in-time
                    </span>
                  </div>
                  <p className="font-bold text-xl text-amber-600 mt-1">
                    {cycleAnalysis.reversed_cycles || 0}
                  </p>
                </div>
                <div className="bg-white p-3 rounded-md shadow-sm border border-gray-100 hover:shadow-md transition-shadow duration-200">
                  <div className="flex items-center justify-between">
                    <p className="text-gray-500 text-xs">Mixed Time</p>
                    <span className="text-xs px-2 py-0.5 bg-purple-100 text-purple-700 rounded-full">
                      Complex
                    </span>
                  </div>
                  <p className="font-bold text-xl text-purple-600 mt-1">
                    {cycleAnalysis.mixed_cycles || 0}
                  </p>
                </div>
                <div className="bg-white p-3 rounded-md shadow-sm border border-gray-100 hover:shadow-md transition-shadow duration-200">
                  <div className="flex items-center justify-between">
                    <p className="text-gray-500 text-xs">Influential</p>
                    <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                      High-impact
                    </span>
                  </div>
                  <p className="font-bold text-xl text-blue-600 mt-1">
                    {cycleAnalysis.influential_cycles || 0}
                  </p>
                </div>
              </div>
            </div>

            
            <div className="mt-4 text-xs text-gray-500 bg-gray-50 p-3 rounded-md border-l-2 border-blue-400">
              <h4 className="font-semibold text-gray-700 mb-1">What are citation cycles?</h4>
              <p className="mb-1"><span className="font-medium text-gray-700">Chronological cycles:</span> Papers cite each other following time order (newer cites older)</p>
              <p className="mb-1"><span className="font-medium text-gray-700">Reversed cycles:</span> Papers cite backwards in time (older somehow cites newer)</p>
              <p><span className="font-medium text-gray-700">Influential cycles:</span> Contain at least one highly-cited paper (100+ citations)</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CycleAnalysis;