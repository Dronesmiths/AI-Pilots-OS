"use client"

import { useEffect, useState } from "react"
import { Shield, Activity, AlertCircle, Clock, Zap } from "lucide-react"

export default function ClawSupervisorPage() {
  const [data, setData] = useState<any>(null)

  useEffect(() => {
    async function fetchData() {
      const res = await fetch("/api/admin/claw/supervisor-summary")
      const json = await res.json()
      setData(json)
    }
    fetchData()
    const interval = setInterval(fetchData, 15000)
    return () => clearInterval(interval)
  }, [])

  if (!data) return <div className="p-10 text-zinc-400">Loading CLAW Supervisor HUD...</div>

  const { state, recentEvents } = data

  return (
    <div className="p-10 max-w-6xl mx-auto font-sans bg-zinc-950 text-zinc-200 min-h-screen">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-black text-white flex items-center gap-3">
            <Shield className="w-8 h-8 text-blue-500" />
            CLAW Navigation Supervisor
          </h1>
          <p className="text-zinc-400 mt-2">Dampens scaling failures instantly to protect Nova memory loops.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-10">
        {state?.lanes?.map((lane: any) => (
          <div
            key={lane.laneKey}
            className={`p-5 rounded-lg border-l-4 bg-zinc-900 border-zinc-800 shadow-xl ${
              lane.status === "healthy" ? "border-l-emerald-500" :
              lane.status === "warning" ? "border-l-yellow-500" :
              lane.status === "throttled" ? "border-l-orange-500" : "border-l-red-500"
            }`}
          >
            <div className="flex justify-between items-start mb-2">
              <h3 className="font-bold text-white font-mono break-all leading-tight">{lane.laneKey}</h3>
              <Activity className={`w-4 h-4 ${lane.status === "healthy" ? "text-emerald-500" : "text-zinc-500"}`} />
            </div>
            
            <div className="text-2xl font-bold mb-4 font-mono">
              {lane.status.toUpperCase()}
            </div>
            
            <div className="space-y-1 text-sm text-zinc-400 font-mono">
              <div className="flex justify-between"><span>Limit:</span> <span className="text-zinc-200">{lane.concurrencyLimit}</span></div>
              <div className="flex justify-between"><span>Queue:</span> <span className="text-zinc-200">{lane.queueDepth}</span></div>
              <div className="flex justify-between"><span>Errors:</span> <span className={`${lane.errorRate > 0 ? "text-red-400" : "text-emerald-400"}`}>{(lane.errorRate * 100).toFixed(1)}%</span></div>
              <div className="flex justify-between"><span>Backoff:</span> <span>{lane.backoffMs}ms</span></div>
            </div>
            {lane.reason?.length > 0 && (
              <div className="mt-3 p-2 bg-black/50 rounded text-xs text-zinc-500 overflow-hidden text-ellipsis whitespace-nowrap">
                {lane.reason[0]}
              </div>
            )}
          </div>
        ))}
      </div>

      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
        <Zap className="w-5 h-5 text-yellow-500" />
        System Event Trace
      </h2>
      <div className="bg-zinc-900 border border-zinc-800 rounded-lg overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-zinc-950 font-mono text-zinc-500">
            <tr>
              <th className="p-4 w-40">Time</th>
              <th className="p-4 w-40">Lane</th>
              <th className="p-4 w-40">Event</th>
              <th className="p-4">Reason</th>
              <th className="p-4 w-20">Score</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {recentEvents?.map((evt: any) => (
              <tr key={evt._id} className="hover:bg-zinc-800/50 transition-colors">
                <td className="p-4 text-zinc-400 font-mono text-xs">{new Date(evt.createdAt).toLocaleTimeString()}</td>
                <td className="p-4 font-mono font-bold text-zinc-300">{evt.laneKey}</td>
                <td className="p-4">
                  <span className={`px-2 py-1 rounded text-xs font-bold ${
                    evt.eventType.includes("FAIL") || evt.eventType.includes("PAUSED") ? "bg-red-500/20 text-red-400" :
                    evt.eventType.includes("THROTTLE") ? "bg-orange-500/20 text-orange-400" :
                    evt.eventType.includes("WARN") ? "bg-yellow-500/20 text-yellow-400" :
                    "bg-emerald-500/20 text-emerald-400"
                  }`}>
                    {evt.eventType}
                  </span>
                </td>
                <td className="p-4 text-zinc-400 text-xs font-mono">{evt.reason?.[0] || "-"}</td>
                <td className="p-4 text-zinc-300 font-mono">{evt.anomalyScore}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
