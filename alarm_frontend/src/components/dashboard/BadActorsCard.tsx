import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { ActualCalcBadActorsResponse } from '@/types/actualCalc'
import { Button } from '@/components/ui/button'
import { useInsightModal } from '@/components/insights/useInsightModal'

interface BadActorsCardProps {
  data: ActualCalcBadActorsResponse | null
  totalFloodCount?: number
  includeSystem?: boolean
  isLoading?: boolean
  limit?: number
}

function isMetaSource(name: string): boolean {
  const s = String(name || '').trim().toUpperCase()
  if (!s) return false
  return s === 'REPORT' || s.startsWith('$') || s.startsWith('ACTIVITY') || s.startsWith('SYS_') || s.startsWith('SYSTEM')
}

export default function BadActorsCard({ data, totalFloodCount, includeSystem = true, isLoading = false, limit = 10 }: BadActorsCardProps) {
  const { onOpen: openInsightModal } = useInsightModal()

  const top = (data?.top_actors || []).filter(a => includeSystem || !isMetaSource(a.Source)).slice(0, limit)
  const isEmpty = !data || top.length === 0

  const handleInsight = () => {
    const payload = top.map(a => ({
      source: a.Source,
      flood_count: a.Total_Alarm_In_Floods,
      incidents: a.Flood_Involvement_Count,
      share_pct: totalFloodCount && totalFloodCount > 0 ? Math.round((a.Total_Alarm_In_Floods / totalFloodCount) * 1000) / 10 : null,
    }))
    openInsightModal(payload, `Bad Actors — Top ${limit}`)
  }

  return (
    <Card className="shadow-metric-card bg-dashboard-metric-card-bg">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg font-semibold text-foreground">Bad Actors</CardTitle>
            <CardDescription>Top sources by alarms during flood windows</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleInsight} disabled={isLoading || isEmpty}>Insights</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-64 bg-muted animate-pulse rounded" />
        ) : isEmpty ? (
          <div className="h-32 flex items-center justify-center text-muted-foreground">No bad actors found.</div>
        ) : (
          <div className="overflow-hidden rounded border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50%]">Source</TableHead>
                  <TableHead className="text-right">Total in Floods</TableHead>
                  <TableHead className="text-right">Flood Windows</TableHead>
                  <TableHead className="text-right">Share</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {top.map((row, idx) => {
                  const share = totalFloodCount && totalFloodCount > 0 ? (row.Total_Alarm_In_Floods / totalFloodCount) * 100 : null
                  return (
                    <TableRow key={`${row.Source}-${idx}`}>
                      <TableCell title={row.Source}>
                        <div className="flex items-center gap-2">
                          <span className={`inline-block w-2.5 h-2.5 rounded-full ${isMetaSource(row.Source) ? 'bg-muted' : 'bg-primary'}`} />
                          <span className="truncate max-w-[520px]">{row.Source}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-medium">{Number(row.Total_Alarm_In_Floods || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{Number(row.Flood_Involvement_Count || 0).toLocaleString()}</TableCell>
                      <TableCell className="text-right">{share === null ? '—' : `${share.toFixed(1)}%`}</TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
            <div className="px-4 py-2 text-xs text-muted-foreground border-t">
              {typeof totalFloodCount === 'number' && totalFloodCount > 0 ? (
                <>Share = actor total / overall total flood alarms ({totalFloodCount.toLocaleString()})</>
              ) : (
                <>Share requires flood totals</>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
