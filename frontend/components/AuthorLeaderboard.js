import React, { useState } from 'react';

const AuthorLeaderboard = ({ rankings, onAuthorClick }) => {
  const [activeTab, setActiveTab] = useState('citations');
  
  if (!rankings || !rankings.authors) {
    return (
      <div className="p-6 text-gray-500 text-center bg-gray-50 rounded-md">
        <svg className="w-12 h-12 mx-auto mb-3 text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
        </svg>
        <p className="font-medium">No author ranking data available</p>
        <p className="text-sm mt-2 text-gray-400">Author rankings require an API with author analysis enabled</p>
      </div>
    );
  }
  
  const { authors, papers } = rankings;
  
  const renderAuthorTable = (authorList) => {
    if (!authorList || authorList.length === 0) {
      return (
        <div className="text-center p-4 bg-gray-50 rounded-md">
          <p className="text-gray-500">No authors found in this dataset</p>
        </div>
      );
    }
    
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 shadow-sm">
          <thead>
            <tr className="bg-gray-50">
              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                #
              </th>
              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Author
              </th>
              <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                {activeTab === 'papers' ? 'Papers' : 
                 activeTab === 'citations' ? 'Citations' : 
                 'h-index'}
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {authorList.map((author, index) => (
              <tr 
                key={author.id} 
                className="hover:bg-blue-50 cursor-pointer transition-colors duration-150"
                onClick={() => onAuthorClick && onAuthorClick(author)}
              >
                <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${
                    index < 3 ? 'bg-blue-100 text-blue-700 font-semibold' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {index + 1}
                  </span>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-sm font-medium text-gray-800">
                  {author.name}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-sm text-right font-semibold text-gray-700">
                  {activeTab === 'papers' ? author.paper_count : 
                   activeTab === 'citations' ? author.total_citations : 
                   author.h_index}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };
  
  const renderPaperTable = (paperList) => {
    if (!paperList || paperList.length === 0) {
      return (
        <div className="text-center p-4 bg-gray-50 rounded-md">
          <p className="text-gray-500">No papers found in this dataset</p>
        </div>
      );
    }
    
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 shadow-sm">
          <thead>
            <tr className="bg-gray-50">
              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                #
              </th>
              <th scope="col" className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Paper
              </th>
              <th scope="col" className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Year
              </th>
              <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Citations
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {paperList.map((paper, index) => (
              <tr key={paper.id} className="hover:bg-blue-50 cursor-pointer transition-colors duration-150">
                <td className="px-3 py-2 whitespace-nowrap text-sm text-gray-500">
                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full ${
                    index < 3 ? 'bg-amber-100 text-amber-700 font-semibold' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {index + 1}
                  </span>
                </td>
                <td className="px-3 py-2 text-sm font-medium text-gray-800 max-w-xs truncate">
                  {paper.title}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-sm text-center text-gray-500">
                  {paper.year || '—'}
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-sm text-right font-semibold text-gray-700">
                  {paper.citations}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };
  
  const getActiveAuthorList = () => {
    if (activeTab === 'papers') return authors.by_papers;
    if (activeTab === 'citations') return authors.by_citations;
    if (activeTab === 'h-index') return authors.by_h_index;
    return [];
  };
  
  return (
    <div className="bg-white rounded-md overflow-hidden">
      <div className="px-4 py-3 bg-gradient-to-r from-blue-500 to-indigo-600 text-white">
        <h2 className="text-lg font-semibold">Research Impact Rankings</h2>
        <p className="text-sm opacity-80">Author and paper influence metrics</p>
      </div>
      
      <div className="border-b border-gray-200">
        <nav className="flex -mb-px">
          <button
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors duration-150 ${
              activeTab === 'citations' 
                ? 'border-indigo-500 text-indigo-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => setActiveTab('citations')}
          >
            By Citations
          </button>
          <button
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors duration-150 ${
              activeTab === 'h-index' 
                ? 'border-indigo-500 text-indigo-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => setActiveTab('h-index')}
          >
            By h-index
          </button>
          <button
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors duration-150 ${
              activeTab === 'papers' 
                ? 'border-indigo-500 text-indigo-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => setActiveTab('papers')}
          >
            By Papers
          </button>
          <button
            className={`py-3 px-4 text-sm font-medium border-b-2 transition-colors duration-150 ${
              activeTab === 'most-cited-papers' 
                ? 'border-indigo-500 text-indigo-600' 
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
            onClick={() => setActiveTab('most-cited-papers')}
          >
            Top Papers
          </button>
        </nav>
      </div>
      
      <div className="p-4">
        {activeTab === 'most-cited-papers' 
          ? renderPaperTable(papers.most_cited)
          : renderAuthorTable(getActiveAuthorList())
        }
      </div>
      
      <div className="p-3 text-xs text-gray-500 bg-gray-50 flex items-center">

        <p>Rankings are based on papers and citations within this graph only. Click on an author to highlight their papers.</p>
      </div>
    </div>
  );
};

export default AuthorLeaderboard;