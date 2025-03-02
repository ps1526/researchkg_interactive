import { useState, useEffect } from 'react';
import SearchResults from './SearchResults';
import NeighborsList from './NeighborsList';

export default function Sidebar({
  onFileUpload,
  graphData,
  nodeById,
  selectedNode,
  onNodeSelect,
  filterOptions,
  onFilterChange,
  onToggleCycles,
  showCycles,
  onReset,
  cycleCount
}) {
  const [activeTab, setActiveTab] = useState('search');
  const [localFilters, setLocalFilters] = useState(filterOptions);
  const [statsData, setStatsData] = useState({
    paperCount: 0,
    authorCount: 0,
    citationCount: 0,
    avgCitations: 0
  });
  
  // Update local filters when props change
  useEffect(() => {
    setLocalFilters(filterOptions);
  }, [filterOptions]);
  
  // Calculate stats
  useEffect(() => {
    if (!graphData) return;
    
    let papers = 0;
    let authors = 0;
    let totalCitations = 0;
    
    graphData.nodes.forEach(node => {
      if (node.type === 'paper') {
        papers++;
        totalCitations += node.citation_count || 0;
      } else if (node.type === 'author') {
        authors++;
      }
    });
    
    setStatsData({
      paperCount: papers,
      authorCount: authors,
      citationCount: graphData.edges.filter(e => e.type === 'cites').length,
      avgCitations: papers > 0 ? (totalCitations / papers).toFixed(2) : 0
    });
  }, [graphData]);
  
  // Handle filter changes
  const handleFilterChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;
    
    const newFilters = {
      ...localFilters,
      [name]: newValue
    };
    
    setLocalFilters(newFilters);
  };
  
  // Apply filters
  const applyFilters = () => {
    onFilterChange(localFilters);
  };
  
  // Reset filters
  const resetFilters = () => {
    const emptyFilters = {
      searchTerm: '',
      nodeType: 'all',
      minYear: '',
      authorName: '',
      fieldsOfStudy: '',
      isOpenAccess: false
    };
    
    setLocalFilters(emptyFilters);
    onFilterChange(emptyFilters);
  };
  
  // Switch tabs
  const switchTab = (tab) => {
    setActiveTab(tab);
  };

  return (
    <div className="w-80 h-full bg-white shadow-md p-4 flex flex-col overflow-hidden">
      
      
      {/* Display controls */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex space-x-2">
          <button 
            onClick={onReset}
            className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
            disabled={!graphData}
          >
            Reset View
          </button>
          <button 
            onClick={onToggleCycles}
            className={`flex-1 px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
              showCycles 
                ? 'bg-amber-500 text-white hover:bg-amber-600 focus:ring-amber-500' 
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 focus:ring-gray-500'
            }`}
            disabled={!graphData || cycleCount === 0}
          >
            {showCycles ? 'Hide Cycles' : 'Show Cycles'}
          </button>
        </div>
        {graphData && cycleCount > 0 && (
          <p className="text-xs text-gray-600">{cycleCount} citation cycles found</p>
        )}
      </div>
                  
      {/* Search and filters */}
      <div className="space-y-4 mb-4">
        <h2 className="font-semibold">Search & Filters</h2>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Search Term</label>
          <input 
            type="text" 
            name="searchTerm"
            value={localFilters.searchTerm}
            onChange={handleFilterChange}
            placeholder="Search papers by title, abstract..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Author Name</label>
          <input 
            type="text" 
            name="authorName"
            value={localFilters.authorName}
            onChange={handleFilterChange}
            placeholder="Search by author name"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Node Type</label>
            <select 
              name="nodeType"
              value={localFilters.nodeType}
              onChange={handleFilterChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All</option>
              <option value="paper">Papers Only</option>
              <option value="author">Authors Only</option>
            </select>
          </div>
          
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Min Year</label>
            <input 
              type="number" 
              name="minYear"
              value={localFilters.minYear}
              onChange={handleFilterChange}
              placeholder="Min Year"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Fields of Study</label>
          <input 
            type="text" 
            name="fieldsOfStudy"
            value={localFilters.fieldsOfStudy}
            onChange={handleFilterChange}
            placeholder="e.g. Computer Science, Physics"
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-500 mt-1">Separate with commas</p>
        </div>
        
        <div className="flex items-center">
          <input 
            type="checkbox" 
            id="isOpenAccess" 
            name="isOpenAccess"
            checked={localFilters.isOpenAccess}
            onChange={handleFilterChange}
            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
          />
          <label htmlFor="isOpenAccess" className="ml-2 block text-sm text-gray-700">
            Open Access Only
          </label>
        </div>
        
        <div className="flex space-x-2">
          <button 
            onClick={applyFilters}
            className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Apply Filters
          </button>
          <button 
            onClick={resetFilters}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
          >
            Reset
          </button>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="mb-2">
        <div className="flex border-b border-gray-200">
          <button
            className={`flex-1 py-2 font-medium text-sm ${activeTab === 'search' ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => switchTab('search')}
          >
            Search Results
          </button>
          <button
            className={`flex-1 py-2 font-medium text-sm ${activeTab === 'neighbors' ? 'text-blue-600 border-b-2 border-blue-500' : 'text-gray-500 hover:text-gray-700'}`}
            onClick={() => switchTab('neighbors')}
          >
            Connected Papers
          </button>
        </div>
      </div>
      
      {/* Tab content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'search' ? (
          <SearchResults 
            graphData={graphData}
            nodeById={nodeById}
            selectedNode={selectedNode}
            onNodeSelect={onNodeSelect}
            highlightedNodes={localFilters}
          />
        ) : (
          <NeighborsList 
            graphData={graphData}
            nodeById={nodeById}
            selectedNode={selectedNode}
            onNodeSelect={onNodeSelect}
          />
        )}
      </div>
      
      {/* Stats footer */}
      {graphData && (
        <div className="mt-4 pt-3 border-t border-gray-200 text-xs text-gray-600">
          <p>Papers: {statsData.paperCount}</p>
          <p>Authors: {statsData.authorCount}</p>
          <p>Citations: {statsData.citationCount}</p>
          <p>Avg Citations per Paper: {statsData.avgCitations}</p>
        </div>
      )}
    </div>
  );
}