import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../../components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../../components/ui/tooltip';
import { Loader2, RefreshCw, Shield, Search, X, Download, Filter, Activity, Trash2, PlusCircle, Edit, Radio } from 'lucide-react';
import { api } from '../../lib/api';
import { TablePagination } from '../../components/shared/TablePagination';

const ACTION_STYLES: Record<string, { color: string; icon: React.ReactNode }> = {
  CREATE:    { color: 'bg-green-100 text-green-700 border-green-200',   icon: <PlusCircle className="h-3 w-3" /> },
  UPDATE:    { color: 'bg-blue-100 text-blue-700 border-blue-200',     icon: <Edit className="h-3 w-3" /> },
  DELETE:    { color: 'bg-red-100 text-red-700 border-red-200',        icon: <Trash2 className="h-3 w-3" /> },
  BROADCAST: { color: 'bg-purple-100 text-purple-700 border-purple-200', icon: <Radio className="h-3 w-3" /> },
  LOGIN:     { color: 'bg-gray-100 text-gray-700 border-gray-200',     icon: <Activity className="h-3 w-3" /> },
};

const ENTITY_OPTIONS = ['student', 'teacher', 'course', 'batch', 'subject', 'material', 'payment', 'fee', 'notification'];
const ACTION_OPTIONS = ['CREATE', 'UPDATE', 'DELETE', 'BROADCAST', 'LOGIN'];
const PAGE_SIZE = 20;

function buildQueryString(params: Record<string, string | number | undefined>) {
  const q = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== '') q.set(k, String(v));
  });
  return q.toString() ? `?${q.toString()}` : '';
}

function exportToCsv(rows: any[], filename: string) {
  const headers = ['Time', 'User', 'Role', 'Action', 'Entity', 'Details', 'IP Address'];
  const csvRows = [
    headers.join(','),
    ...rows.map(r => [
      new Date(r.createdAt).toISOString(),
      `"${(r.userName || '').replace(/"/g, '""')}"`,
      r.userRole || '',
      r.action || '',
      r.entity || '',
      `"${(r.details || '').replace(/"/g, '""')}"`,
      r.ipAddress || '',
    ].join(',')),
  ];
  const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export const AuditLogsPage: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [pagination, setPagination] = useState({ page: 1, limit: PAGE_SIZE, total: 0, totalPages: 1 });
  const [actionStats, setActionStats] = useState<{ action: string; total: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [page, setPage] = useState(1);
  const [entity, setEntity] = useState('');
  const [action, setAction] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const searchDebounce = useRef<ReturnType<typeof setTimeout>>();

  const buildParams = useCallback((p: number, ent: string, act: string, s: string, from: string, to: string) => ({
    page: p, limit: PAGE_SIZE,
    status: ent || undefined,
    action: act || undefined,
    search: s || undefined,
    from: from || undefined,
    to: to || undefined,
  }), []);

  const load = useCallback((p = page, ent = entity, act = action, s = search, from = dateFrom, to = dateTo) => {
    setLoading(true);
    api.admin.getAuditLogs(buildParams(p, ent, act, s, from, to))
      .then((r) => {
        if (r.success) {
          setLogs(r.data);
          setPagination(r.pagination);
          if (r.actionStats) setActionStats(r.actionStats);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [page, entity, action, search, dateFrom, dateTo, buildParams]);

  useEffect(() => { load(); }, [page, entity, action, dateFrom, dateTo]);

  const handleSearchChange = (val: string) => {
    setSearch(val);
    clearTimeout(searchDebounce.current);
    searchDebounce.current = setTimeout(() => { setPage(1); load(1, entity, action, val, dateFrom, dateTo); }, 400);
  };

  const clearFilters = () => {
    setEntity(''); setAction(''); setSearch(''); setDateFrom(''); setDateTo(''); setPage(1);
  };

  const hasFilters = !!(entity || action || search || dateFrom || dateTo);

  const handleExport = async () => {
    setExporting(true);
    try {
      const params = { ...buildParams(1, entity, action, search, dateFrom, dateTo), all: 'true' as any };
      const r = await api.admin.getAuditLogs(params);
      if (r.success && r.data.length > 0) {
        const dateStr = new Date().toISOString().slice(0, 10);
        exportToCsv(r.data, `audit-logs-${dateStr}.csv`);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setExporting(false);
    }
  };

  const relativeTime = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    const hrs = Math.floor(mins / 60);
    const days = Math.floor(hrs / 24);
    if (days > 0) return `${days}d ago`;
    if (hrs > 0) return `${hrs}h ago`;
    if (mins > 0) return `${mins}m ago`;
    return 'just now';
  };

  const totalByAction = (act: string) => actionStats.find(s => s.action === act)?.total ?? 0;
  const grandTotal = actionStats.reduce((s, a) => s + Number(a.total), 0);

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 flex items-center gap-3">
              <Shield className="h-8 w-8 text-indigo-600" />
              Audit Logs
            </h1>
            <p className="text-muted-foreground mt-1">
              Complete trail of all admin actions · {grandTotal.toLocaleString()} total entries
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => load()} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="outline"
              onClick={handleExport}
              disabled={exporting || loading}
              className="flex items-center gap-2"
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Export CSV
            </Button>
          </div>
        </div>

        {/* Stat Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {ACTION_OPTIONS.map((act) => {
            const style = ACTION_STYLES[act];
            const cnt = totalByAction(act);
            return (
              <button
                key={act}
                onClick={() => { setAction(action === act ? '' : act); setPage(1); }}
                className={`text-left p-4 rounded-lg border-2 transition-all ${
                  action === act
                    ? style.color + ' border-current shadow-sm'
                    : 'bg-white border-gray-100 hover:border-gray-200'
                }`}
              >
                <div className={`flex items-center gap-1.5 mb-1 text-xs font-semibold ${action === act ? '' : 'text-gray-500'}`}>
                  <span className={action === act ? '' : 'text-gray-400'}>{style.icon}</span>
                  {act}
                </div>
                <p className="text-2xl font-bold">{Number(cnt).toLocaleString()}</p>
              </button>
            );
          })}
        </div>

        {/* Filters */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2 text-muted-foreground">
              <Filter className="h-4 w-4" />
              Filters
              {hasFilters && (
                <button onClick={clearFilters} className="ml-auto text-xs text-red-500 hover:text-red-700 flex items-center gap-1">
                  <X className="h-3 w-3" />Clear all
                </button>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-3 items-end">
              <div>
                <Label className="text-xs mb-1 block">Entity</Label>
                <Select value={entity || 'all'} onValueChange={(v) => { setEntity(v === 'all' ? '' : v); setPage(1); }}>
                  <SelectTrigger className="w-36 h-9">
                    <SelectValue placeholder="All entities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All entities</SelectItem>
                    {ENTITY_OPTIONS.map((e) => (
                      <SelectItem key={e} value={e} className="capitalize">{e}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs mb-1 block">Action</Label>
                <Select value={action || 'all'} onValueChange={(v) => { setAction(v === 'all' ? '' : v); setPage(1); }}>
                  <SelectTrigger className="w-36 h-9">
                    <SelectValue placeholder="All actions" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All actions</SelectItem>
                    {ACTION_OPTIONS.map((a) => (
                      <SelectItem key={a} value={a}>{a}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs mb-1 block">From Date</Label>
                <Input
                  type="date"
                  className="h-9 w-36"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                  max={dateTo || undefined}
                />
              </div>

              <div>
                <Label className="text-xs mb-1 block">To Date</Label>
                <Input
                  type="date"
                  className="h-9 w-36"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                  min={dateFrom || undefined}
                />
              </div>

              <div className="flex-1 min-w-[200px]">
                <Label className="text-xs mb-1 block">Search</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="User name, action, details..."
                    className="pl-9 pr-8 h-9"
                    value={search}
                    onChange={(e) => handleSearchChange(e.target.value)}
                  />
                  {search && (
                    <button onClick={() => { setSearch(''); setPage(1); load(1, entity, action, '', dateFrom, dateTo); }} className="absolute right-2 top-2 text-muted-foreground hover:text-gray-900">
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="text-center py-16"><Loader2 className="h-8 w-8 animate-spin mx-auto text-muted-foreground" /></div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50/50">
                      <TableHead className="w-28">Time</TableHead>
                      <TableHead>User</TableHead>
                      <TableHead className="w-20">Role</TableHead>
                      <TableHead className="w-28">Action</TableHead>
                      <TableHead className="w-24">Entity</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead className="w-28">IP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => {
                      const style = ACTION_STYLES[log.action] || { color: 'bg-gray-100 text-gray-700 border-gray-200', icon: null };
                      return (
                        <TableRow key={log.id} className="hover:bg-gray-50/50">
                          <TableCell className="text-xs">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="text-muted-foreground cursor-default">{relativeTime(log.createdAt)}</span>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p className="text-xs">{new Date(log.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TableCell>
                          <TableCell className="font-medium text-sm">{log.userName || <span className="text-muted-foreground italic text-xs">system</span>}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize text-xs">{log.userRole || '—'}</Badge>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-xs font-semibold ${style.color}`}>
                              {style.icon}
                              {log.action}
                            </span>
                          </TableCell>
                          <TableCell className="capitalize text-sm text-muted-foreground">{log.entity}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span className="block max-w-xs truncate cursor-default">{log.details || '—'}</span>
                              </TooltipTrigger>
                              {log.details && log.details.length > 60 && (
                                <TooltipContent side="bottom" className="max-w-sm">
                                  <p className="text-xs whitespace-pre-wrap">{log.details}</p>
                                </TooltipContent>
                              )}
                            </Tooltip>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground font-mono">{log.ipAddress || '—'}</TableCell>
                        </TableRow>
                      );
                    })}
                    {logs.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-16 text-muted-foreground">
                          <Shield className="h-8 w-8 mx-auto mb-3 opacity-30" />
                          {hasFilters ? 'No logs match your filters' : 'No audit logs found'}
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <TablePagination
          pagination={pagination}
          onPageChange={(p) => { setPage(p); load(p, entity, action, search, dateFrom, dateTo); }}
        />
      </div>
    </TooltipProvider>
  );
};
