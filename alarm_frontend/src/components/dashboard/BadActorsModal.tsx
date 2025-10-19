import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Input } from '@/components/ui/input'
import { useState, useMemo } from 'react'

interface BadActorsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  data: {
    total_actors: number
    top_actors: Array<{
      Source: string
      Total_Alarm_In_Floods: number
      Flood_Involvement_Count: number
    }>
    totalFloodCount?: number
  } | null
}

function isMetaSource(name: string): boolean {
  const s = String(name || '').trim().toUpperCase()
  if (!s) return false
  return s === 'REPORT' || s.startsWith('$') || s.startsWith('ACTIVITY') || s.startsWith('SYS_') || s.startsWith('SYSTEM')
}

export function BadActorsModal({ open, onOpenChange, data }: BadActorsModalProps) {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredActors = useMemo(() => {
    if (!data?.top_actors) return []
    const term = searchTerm.toLowerCase().trim()
    if (!term) return data.top_actors
    return data.top_actors.filter(a => 
      String(a.Source || '').toLowerCase().includes(term)
    )
  }, [data?.top_actors, searchTerm])

  const totalFloodCount = data?.totalFloodCount || 0

  if (!data) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">Bad Actors</DialogTitle>
          <DialogDescription>
            Top sources contributing most alarms during flood windows
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 flex-1 overflow-hidden flex flex-col">
          {/* Summary stats */}
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div className="p-3 rounded border bg-muted/30">
              <p className="text-muted-foreground text-xs">Total Bad Actors</p>
              <p className="text-xl font-bold">{data.total_actors}</p>
            </div>
            <div className="p-3 rounded border bg-muted/30">
              <p className="text-muted-foreground text-xs">Total Flood Alarms</p>
              <p className="text-xl font-bold">{totalFloodCount.toLocaleString()}</p>
            </div>
            <div className="p-3 rounded border bg-muted/30">
              <p className="text-muted-foreground text-xs">Showing</p>
              <p className="text-xl font-bold">{filteredActors.length} sources</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Input
              type="text"
              placeholder="Search by source..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
          </div>

          {/* Table */}
          <div className="flex-1 overflow-y-auto border rounded">
            <Table>
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="w-[40%]">Source</TableHead>
                  <TableHead className="text-right">Total in Floods</TableHead>
                  <TableHead className="text-right">Flood Windows</TableHead>
                  <TableHead className="text-right">Share of Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredActors.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      {searchTerm ? 'No sources match your search' : 'No bad actors found'}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredActors.map((actor, idx) => {
                    const share = totalFloodCount > 0 
                      ? (Number(actor.Total_Alarm_In_Floods || 0) / totalFloodCount) * 100 
                      : null
                    const isMeta = isMetaSource(actor.Source)
                    
                    return (
                      <TableRow key={`${actor.Source}-${idx}`}>
                        <TableCell title={actor.Source}>
                          <div className="flex items-center gap-2">
                            <span 
                              className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                                isMeta ? 'bg-muted' : 'bg-primary'
                              }`} 
                            />
                            <span className="truncate max-w-[400px]">{actor.Source}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {Number(actor.Total_Alarm_In_Floods || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {Number(actor.Flood_Involvement_Count || 0).toLocaleString()}
                        </TableCell>
                        <TableCell className="text-right">
                          {share === null ? '—' : (
                            <span className="font-medium">
                              {share.toFixed(1)}%
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })
                )}
              </TableBody>
            </Table>
          </div>

          {/* Footer legend */}
          <div className="text-xs text-muted-foreground space-y-1 pt-2 border-t">
            <p><strong>Share of Total:</strong> Percentage of all flood alarms attributed to this source</p>
            <p><strong>Flood Windows:</strong> Number of distinct flood periods this source participated in</p>
            <div className="flex items-center gap-4 pt-1">
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-primary" />
                <span>Operational source</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block w-2.5 h-2.5 rounded-full bg-muted" />
                <span>System/meta source</span>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
