import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { trpc } from "../utils/trpc";
import "./App.css";

import type { LeetCodeData } from "../../server/src/types/leetcode";
function App() {
  const [value, setValue] = useState<string>("");
  const [queryName, setQueryName] = useState<string>("");

  const queryClient = useQueryClient();

  const userQuery = useQuery({
    ...trpc.user.hello.queryOptions({ name: queryName }),
    enabled: !!queryName, // Only run query when queryName exists
  });

  const handleSubmit = () => {
    if (value.trim()) {
      console.log("Submitted:", value);
      setQueryName(value); // This will trigger the query
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSubmit();
    }
  };

  const handleClear = () => {
    setValue('');
    setQueryName('');
    // Use queryClient to remove queries
    queryClient.removeQueries({
      queryKey: trpc.user.hello.getQueryKey({ name: queryName })
    });
  };
  const formatTimestamp = (timestamp: string) => {
    return new Date(parseInt(timestamp) * 1000).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Accepted":
        return "bg-green-100 text-green-800";
      case "Wrong Answer":
        return "bg-red-100 text-red-800";
      case "Runtime Error":
        return "bg-yellow-100 text-yellow-800";
      case "Time Limit Exceeded":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6">
      {/* Header */}
      <div className="text-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          LeetCode Submission Tracker
        </h1>
        <p className="text-gray-600">
          Enter a LeetCode username to view recent submissions
        </p>
      </div>

      {/* Input Section */}
      <div className="relative flex items-center mb-6 max-w-md mx-auto">
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyPress}
          placeholder="Enter LeetCode username..."
          className="w-full px-4 py-3 pr-24 text-gray-700 bg-white border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent shadow-sm"
        />
        <div className="absolute right-2 flex gap-1">
          {queryName && (
            <button
              onClick={handleClear}
              className="p-2 text-gray-500 hover:text-gray-700 rounded-md transition-colors"
              title="Clear"
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
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
          <button
            onClick={handleSubmit}
            disabled={!value.trim() || userQuery.isLoading}
            className="p-2 text-white bg-blue-500 rounded-md hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {userQuery.isLoading ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
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
            )}
          </button>
        </div>
      </div>

      {/* Loading State */}
      {userQuery.isLoading && (
        <div className="mt-4 p-6 border border-gray-300 rounded-lg bg-gray-50">
          <div className="flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mr-3" />
            <p className="text-gray-600">
              Loading submissions for {queryName}...
            </p>
          </div>
        </div>
      )}

      {/* Error State */}
      {userQuery.isError && (
        <div className="mt-4 p-4 border-red-300 bg-red-50 rounded-lg">
          <p className="text-red-600">
            Error:{" "}
            {String(userQuery.error?.message || "Failed to fetch submissions")}
          </p>
          {process.env.NODE_ENV === "development" && (
            <details className="mt-2">
              <summary className="cursor-pointer text-sm text-red-500">
                Debug Info
              </summary>
              <pre className="text-xs mt-2 overflow-auto text-red-700">
                {JSON.stringify(userQuery.error, null, 2)}
              </pre>
            </details>
          )}
        </div>
      )}

      {/* Success State */}
      {userQuery.isSuccess && userQuery.data && (
        <div className="border border-slate-300 rounded-lg shadow-lg bg-white">
          {/* Greeting Header */}
          <div className="p-6 border-b border-gray-200">
            <h2 className="text-2xl font-bold text-slate-800">
              {(userQuery.data as LeetCodeData).greeting}
            </h2>
            <p className="text-gray-600 mt-1">
              Found {(userQuery.data as LeetCodeData).recent_submissions.length}{" "}
              recent submissions
            </p>
          </div>

          {/* Submissions Table */}
          {(userQuery.data as LeetCodeData).recent_submissions.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      #
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Problem
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Language
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Submitted
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {(userQuery.data as LeetCodeData).recent_submissions.map(
                    (sub, index) => (
                      <tr
                        key={`${sub.titleSlug}-${sub.timestamp}`}
                        className="hover:bg-gray-50 transition-colors"
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {index + 1}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {sub.title}
                          </div>
                          <div className="text-sm text-gray-500">
                            {sub.titleSlug}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(sub.statusDisplay)}`}
                          >
                            {sub.statusDisplay}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 capitalize">
                          {sub.lang}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatTimestamp(sub.timestamp)}
                        </td>
                      </tr>
                    ),
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6 text-center">
              <p className="text-gray-500">No recent submissions found.</p>
            </div>
          )}
        </div>
      )}

      {/* Stats Summary (optional) */}
      {userQuery.isSuccess &&
        userQuery.data &&
        (userQuery.data as LeetCodeData).recent_submissions.length > 0 && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
            {(() => {
              const submissions = (userQuery.data as LeetCodeData)
                .recent_submissions;
              const accepted = submissions.filter(
                (s) => s.statusDisplay === "Accepted",
              ).length;
              const wrongAnswer = submissions.filter(
                (s) => s.statusDisplay === "Wrong Answer",
              ).length;
              const total = submissions.length;

              return (
                <>
                  <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                    <div className="text-2xl font-bold text-green-800">
                      {accepted}
                    </div>
                    <div className="text-sm text-green-600">Accepted</div>
                  </div>
                  <div className="bg-red-50 p-4 rounded-lg border border-red-200">
                    <div className="text-2xl font-bold text-red-800">
                      {wrongAnswer}
                    </div>
                    <div className="text-sm text-red-600">Wrong Answer</div>
                  </div>
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <div className="text-2xl font-bold text-blue-800">
                      {total}
                    </div>
                    <div className="text-sm text-blue-600">
                      Total Submissions
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        )}
    </div>
  );
}

export default App;
