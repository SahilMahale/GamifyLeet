import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { trpc } from '../utils/trpc';
import './App.css';

function App() {
  const [value, setValue] = useState('');
  const [queryName, setQueryName] = useState('');

  const userQuery = useQuery({
    ...trpc.user.hello.queryOptions({ name: queryName }),
    enabled: !!queryName, // Only run query when queryName exists
  });

  const handleSubmit = () => {
    if (value.trim()) {
      console.log('Submitted:', value);
      setQueryName(value); // This will trigger the query
    }
  };
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSubmit();
    }
  };

  return (
    <div className="max-w-md mx-auto p-6">
      <div className="relative flex items-center">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Type your message..."
          className="w-full px-4 py-3 pr-12 text-gray-700 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
        />
        <button
          onClick={handleSubmit}
          disabled={!value.trim()}
          className="absolute right-2 p-2 text-white bg-blue-500 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
            />
          </svg>
        </button>
      </div>
      {userQuery.isSuccess && userQuery.data && (
        <div className="border-slate-700 text-amber-600 hover:ring-amber-900">
          <h1>{userQuery.data.greeting}</h1>
          <table className="min-w-full border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 px-4 py-2 text-left">#</th>
                <th className="border border-gray-300 px-4 py-2 text-left">Problem</th>
                <th className="border border-gray-300 px-4 py-2 text-left">Status</th>
              </tr>
            </thead>
            <tbody>
              {userQuery.data.recent_submissions.map((sub, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="border border-gray-300 px-4 py-2">{index + 1}</td>
                  <td className="border border-gray-300 px-4 py-2">{sub.title}</td>
                  <td className={`border border-gray-300 px-4 py-2 ${sub.statusDisplay === 'Accepted'
                      ? 'text-green-600 font-semibold'
                      : 'text-red-600'
                    }`}>
                    {sub.statusDisplay}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )
      }
    </div>
  );
}

export default App;
