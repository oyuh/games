"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Ban,
  Search,
  Shield,
  Sparkles,
  UserRoundX,
} from "lucide-react";
import { api } from "@/lib/client-api";
import {
  BanRecord,
  DashboardSummaryResponse,
  formatDateTime,
  formatRelativeTime,
  NameOverrideRecord,
  normalizeSearchText,
  RestrictedNameRecord,
  shortId,
} from "@/lib/admin";
import { useToast } from "@/components/Toast";
import { Pagination } from "@/components/Pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useConfirmDialog } from "@/components/ui/confirm-dialog";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";

const BAN_TYPE_OPTIONS = [
  { value: "session", label: "Session ban" },
  { value: "ip", label: "IP ban" },
  { value: "region", label: "Region ban" },
] as const;

function Surface({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-[24px] border border-white/8 bg-[#0f1826] p-5 ${className}`}>
      {children}
    </section>
  );
}

function matchesSearch(values: Array<string | null | undefined>, query: string) {
  if (!query) {
    return true;
  }
  return values.some((value) => normalizeSearchText(value).includes(query));
}

function banTone(type: BanRecord["type"]) {
  if (type === "ip") {
    return "border-red-300/20 bg-red-300/10 text-red-50";
  }
  if (type === "region") {
    return "border-amber-300/20 bg-amber-300/10 text-amber-50";
  }
  return "border-sky-300/20 bg-sky-300/10 text-sky-50";
}

export default function BansPage() {
  const { show } = useToast();
  const confirm = useConfirmDialog();
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [overview, setOverview] = useState<DashboardSummaryResponse["summary"]["moderation"] | null>(null);

  const [bans, setBans] = useState<BanRecord[]>([]);
  const [restrictedNames, setRestrictedNames] = useState<RestrictedNameRecord[]>([]);
  const [overrides, setOverrides] = useState<NameOverrideRecord[]>([]);

  const [banPage, setBanPage] = useState(1);
  const [banPageSize, setBanPageSize] = useState(25);
  const [banTotal, setBanTotal] = useState(0);
  const [banTotalPages, setBanTotalPages] = useState(1);

  const [rulePage, setRulePage] = useState(1);
  const [rulePageSize, setRulePageSize] = useState(20);
  const [ruleTotal, setRuleTotal] = useState(0);
  const [ruleTotalPages, setRuleTotalPages] = useState(1);

  const [overridePage, setOverridePage] = useState(1);
  const [overridePageSize, setOverridePageSize] = useState(20);
  const [overrideTotal, setOverrideTotal] = useState(0);
  const [overrideTotalPages, setOverrideTotalPages] = useState(1);

  const [search, setSearch] = useState("");
  const [banFilter, setBanFilter] = useState<"all" | BanRecord["type"]>("all");

  const [newBan, setNewBan] = useState<{
    type: BanRecord["type"];
    value: string;
    reason: string;
  }>({
    type: "ip",
    value: "",
    reason: "",
  });
  const [newRule, setNewRule] = useState({ pattern: "", reason: "" });
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const [overviewResponse, banResponse, ruleResponse, overrideResponse] = await Promise.all([
          api("/dashboard/summary"),
          api(`/bans?${new URLSearchParams({ page: String(banPage), pageSize: String(banPageSize) })}`),
          api(`/names/restricted?${new URLSearchParams({ page: String(rulePage), pageSize: String(rulePageSize) })}`),
          api(`/names/overrides?${new URLSearchParams({ page: String(overridePage), pageSize: String(overridePageSize) })}`),
        ]);

        if (cancelled) {
          return;
        }

        const overviewData = overviewResponse as DashboardSummaryResponse;
        setOverview(overviewData.summary.moderation);

        setBans((banResponse.bans ?? []) as BanRecord[]);
        setBanTotal(banResponse.total ?? 0);
        setBanTotalPages(Math.max(1, banResponse.totalPages ?? 1));

        setRestrictedNames((ruleResponse.restricted ?? []) as RestrictedNameRecord[]);
        setRuleTotal(ruleResponse.total ?? 0);
        setRuleTotalPages(Math.max(1, ruleResponse.totalPages ?? 1));

        setOverrides((overrideResponse.overrides ?? []) as NameOverrideRecord[]);
        setOverrideTotal(overrideResponse.total ?? 0);
        setOverrideTotalPages(Math.max(1, overrideResponse.totalPages ?? 1));
      } catch (error) {
        if (!cancelled) {
          show(error instanceof Error ? error.message : "Unable to load moderation desk.", "error");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [banPage, banPageSize, overridePage, overridePageSize, refreshKey, rulePage, rulePageSize, show]);

  const normalizedSearch = normalizeSearchText(search);

  const visibleBans = useMemo(() => {
    return bans.filter((ban) => {
      if (banFilter !== "all" && ban.type !== banFilter) {
        return false;
      }
      return matchesSearch([ban.type, ban.value, ban.reason], normalizedSearch);
    });
  }, [banFilter, bans, normalizedSearch]);

  const visibleRestrictedNames = useMemo(() => {
    return restrictedNames.filter((entry) =>
      matchesSearch([entry.pattern, entry.reason], normalizedSearch)
    );
  }, [normalizedSearch, restrictedNames]);

  const visibleOverrides = useMemo(() => {
    return overrides.filter((override) =>
      matchesSearch([override.sessionId, override.forcedName, override.reason], normalizedSearch)
    );
  }, [normalizedSearch, overrides]);

  const runAction = async (label: string, action: () => Promise<void>) => {
    setPendingAction(label);
    try {
      await action();
      setRefreshKey((value) => value + 1);
    } catch (error) {
      show(error instanceof Error ? error.message : "Unable to complete that action.", "error");
    } finally {
      setPendingAction(null);
    }
  };

  const addBan = async () => {
    if (!newBan.value.trim()) {
      return;
    }

    await runAction("add-ban", async () => {
      await api("/bans", {
        method: "POST",
        body: {
          type: newBan.type,
          value: newBan.value.trim(),
          reason: newBan.reason.trim(),
        },
      });
      show("Restriction added.", "success");
      setNewBan({ type: newBan.type, value: "", reason: "" });
    });
  };

  const removeBan = async (id: string) => {
    const confirmed = await confirm({
      title: "Remove restriction?",
      description: "This will immediately delete the selected ban entry from the moderation list.",
      confirmLabel: "Remove restriction",
      tone: "destructive",
    });

    if (!confirmed) {
      return;
    }

    await runAction(`remove-ban-${id}`, async () => {
      await api(`/bans/${id}`, { method: "DELETE" });
      show("Restriction removed.", "success");
    });
  };

  const addRestrictedName = async () => {
    if (!newRule.pattern.trim()) {
      return;
    }

    await runAction("add-name-rule", async () => {
      await api("/names/restricted", {
        method: "POST",
        body: {
          pattern: newRule.pattern.trim(),
          reason: newRule.reason.trim(),
        },
      });
      show("Restricted name added.", "success");
      setNewRule({ pattern: "", reason: "" });
    });
  };

  const removeRestrictedName = async (id: string) => {
    const confirmed = await confirm({
      title: "Remove name rule?",
      description: "This pattern will stop being enforced for future name validation.",
      confirmLabel: "Remove rule",
      tone: "warning",
    });

    if (!confirmed) {
      return;
    }

    await runAction(`remove-rule-${id}`, async () => {
      await api(`/names/restricted/${id}`, { method: "DELETE" });
      show("Name rule removed.", "success");
    });
  };

  const removeOverride = async (sessionId: string) => {
    const confirmed = await confirm({
      title: "Clear forced name override?",
      description: "The affected session will go back to using its normal naming flow.",
      confirmLabel: "Clear override",
      tone: "warning",
    });

    if (!confirmed) {
      return;
    }

    await runAction(`remove-override-${sessionId}`, async () => {
      await api(`/clients/${sessionId}/name`, { method: "DELETE" });
      show("Name override cleared.", "success");
    });
  };

  return (
    <>
      <Surface>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {[
            {
              label: "Active bans",
              value: (overview?.totalBans ?? banTotal).toLocaleString(),
              icon: Shield,
            },
            {
              label: "Session bans",
              value: (overview?.sessionBans ?? 0).toLocaleString(),
              icon: Ban,
            },
            {
              label: "IP bans",
              value: (overview?.ipBans ?? 0).toLocaleString(),
              icon: UserRoundX,
            },
            {
              label: "Region bans",
              value: (overview?.regionBans ?? 0).toLocaleString(),
              icon: Sparkles,
            },
            {
              label: "Name controls",
              value: `${(overview?.restrictedNames ?? ruleTotal).toLocaleString()} / ${(overview?.nameOverrides ?? overrideTotal).toLocaleString()}`,
              icon: Search,
            },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="rounded-[20px] border border-white/8 bg-[#111b2a] px-4 py-4">
                <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-500">
                  <Icon className="size-4" />
                  {item.label}
                </div>
                <div className="mt-3 text-2xl font-semibold tracking-[-0.04em] text-white">
                  {item.value}
                </div>
              </div>
            );
          })}
        </div>
      </Surface>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1.2fr_0.8fr]">
        <Surface>
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-500" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search restrictions, names, overrides, or reasons"
                  className="border-white/8 bg-[#0d1624] pl-11 text-slate-50"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {["all", "session", "ip", "region"].map((value) => (
                  <Button
                    key={value}
                    type="button"
                    variant={banFilter === value ? "default" : "outline"}
                    className={
                      banFilter === value
                        ? "bg-primary text-primary-foreground hover:bg-primary/90"
                        : "border-white/8 bg-[#0d1624] text-slate-100 hover:bg-white/[0.06]"
                    }
                    onClick={() => setBanFilter(value as typeof banFilter)}
                  >
                    {value === "all" ? "All bans" : `${value} bans`}
                  </Button>
                ))}
              </div>
            </div>

            <Badge variant="outline" className="w-fit border-white/8 bg-white/[0.03] text-slate-200">
              {visibleBans.length} visible on this page
            </Badge>
          </div>

          <div className="mt-4 overflow-hidden rounded-[20px] border border-white/8 bg-[#0d1624]">
            <Table>
              <TableHeader>
                <TableRow className="border-white/10 hover:bg-transparent">
                  <TableHead className="text-slate-400">Type</TableHead>
                  <TableHead className="text-slate-400">Value</TableHead>
                  <TableHead className="text-slate-400">Reason</TableHead>
                  <TableHead className="text-slate-400">Created</TableHead>
                  <TableHead className="text-slate-400">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && bans.length === 0 ? (
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableCell colSpan={5} className="px-4 py-5">
                      <div className="space-y-2">
                        {Array.from({ length: 5 }).map((_, index) => (
                          <Skeleton key={index} className="h-12 bg-white/5" />
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : visibleBans.length === 0 ? (
                  <TableRow className="border-white/10 hover:bg-transparent">
                    <TableCell colSpan={5} className="px-4 py-12 text-center text-sm text-slate-500">
                      No restrictions match the current search.
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleBans.map((ban) => (
                    <TableRow key={ban.id} className="border-white/8 hover:bg-[#142033]">
                      <TableCell>
                        <Badge className={`border ${banTone(ban.type)}`}>
                          {ban.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-sm text-slate-100">{ban.value}</TableCell>
                      <TableCell className="max-w-md text-sm text-slate-300/80">{ban.reason || "No reason provided"}</TableCell>
                      <TableCell className="text-sm text-slate-400">
                        <div>{formatRelativeTime(ban.createdAt)}</div>
                        <div className="mt-1 text-xs text-slate-500">{formatDateTime(ban.createdAt)}</div>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="destructive"
                          size="sm"
                          className="border border-red-300/20 bg-red-400/12 text-red-50 hover:bg-red-400/22"
                          disabled={pendingAction === `remove-ban-${ban.id}`}
                          onClick={() => void removeBan(ban.id)}
                        >
                          Remove
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4">
            <Pagination
              page={banPage}
              totalPages={banTotalPages}
              total={banTotal}
              pageSize={banPageSize}
              onPageChange={setBanPage}
              onPageSizeChange={(nextSize) => {
                setBanPageSize(nextSize);
                setBanPage(1);
              }}
            />
          </div>
        </Surface>

        <Surface>
          <div className="text-sm font-semibold text-white">Add restriction</div>
          <div className="mt-1 text-sm leading-6 text-slate-400">
            Session bans disconnect immediately. IP and region bans block re-entry on the next auth cycle.
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {BAN_TYPE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={newBan.type === option.value ? "default" : "outline"}
                className={
                  newBan.type === option.value
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border-white/8 bg-[#0d1624] text-slate-100 hover:bg-white/[0.06]"
                }
                onClick={() => setNewBan((current) => ({ ...current, type: option.value }))}
              >
                {option.label}
              </Button>
            ))}
          </div>

          <Input
            value={newBan.value}
            onChange={(event) => setNewBan((current) => ({ ...current, value: event.target.value }))}
            placeholder={
              newBan.type === "session"
                ? "Session id"
                : newBan.type === "ip"
                  ? "IP address"
                  : "Region code"
            }
            className="mt-4 border-white/8 bg-[#0d1624] text-slate-50"
          />
          <Textarea
            value={newBan.reason}
            onChange={(event) => setNewBan((current) => ({ ...current, reason: event.target.value }))}
            placeholder="Reason for this restriction"
            maxLength={200}
            className="mt-3 border-white/8 bg-[#0d1624] text-slate-50"
          />

          <Button
            className="mt-4"
            disabled={!newBan.value.trim() || pendingAction === "add-ban"}
            onClick={() => void addBan()}
          >
            Create restriction
          </Button>

          <div className="mt-5 rounded-[20px] border border-white/8 bg-[#111b2a] p-4 text-sm text-slate-400">
            Name rules are enforced server-side now. Forced name overrides are best created from the client modal when you need to correct a single session without banning the pattern globally.
          </div>
        </Surface>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Surface>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-white">Restricted names</div>
              <div className="mt-1 text-sm leading-6 text-slate-400">
                Supports exact matches and wildcard patterns like <span className="mono text-slate-200">admin*</span>.
              </div>
            </div>
            <Badge variant="outline" className="border-white/8 bg-white/[0.03] text-slate-200">
              {ruleTotal} total
            </Badge>
          </div>

          <div className="mt-4 grid gap-3">
            <Input
              value={newRule.pattern}
              onChange={(event) => setNewRule((current) => ({ ...current, pattern: event.target.value }))}
              placeholder="Restricted pattern"
              className="border-white/8 bg-[#0d1624] text-slate-50"
            />
            <Textarea
              value={newRule.reason}
              onChange={(event) => setNewRule((current) => ({ ...current, reason: event.target.value }))}
              placeholder="Why this name is blocked"
              className="border-white/8 bg-[#0d1624] text-slate-50"
            />
            <Button
              className="w-fit"
              disabled={!newRule.pattern.trim() || pendingAction === "add-name-rule"}
              onClick={() => void addRestrictedName()}
            >
              Add name rule
            </Button>
          </div>

          <div className="mt-4 space-y-3">
            {visibleRestrictedNames.length === 0 ? (
              <div className="rounded-[20px] border border-dashed border-white/8 px-4 py-8 text-sm text-slate-500">
                No name rules on this page match the current search.
              </div>
            ) : (
              visibleRestrictedNames.map((entry) => (
                <div key={entry.id} className="rounded-[20px] border border-white/8 bg-[#111b2a] px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-mono text-sm text-white">{entry.pattern}</div>
                      <div className="mt-2 text-sm text-slate-400">{entry.reason || "No reason provided"}</div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="text-xs uppercase tracking-[0.24em] text-slate-500">
                        {formatRelativeTime(entry.createdAt)}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-white/8 bg-[#0d1624] text-slate-100 hover:bg-white/[0.06]"
                        disabled={pendingAction === `remove-rule-${entry.id}`}
                        onClick={() => void removeRestrictedName(entry.id)}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4">
            <Pagination
              page={rulePage}
              totalPages={ruleTotalPages}
              total={ruleTotal}
              pageSize={rulePageSize}
              onPageChange={setRulePage}
              onPageSizeChange={(nextSize) => {
                setRulePageSize(nextSize);
                setRulePage(1);
              }}
            />
          </div>
        </Surface>

        <Surface>
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-semibold text-white">Forced name overrides</div>
              <div className="mt-1 text-sm leading-6 text-slate-400">
                Create overrides from the client list when a single session needs intervention without adding a global rule.
              </div>
            </div>
            <Badge variant="outline" className="border-white/8 bg-white/[0.03] text-slate-200">
              {overrideTotal} total
            </Badge>
          </div>

          <div className="mt-4 space-y-3">
            {visibleOverrides.length === 0 ? (
              <div className="rounded-[20px] border border-dashed border-white/8 px-4 py-8 text-sm text-slate-500">
                No name overrides on this page match the current search.
              </div>
            ) : (
              visibleOverrides.map((override) => (
                <div key={override.sessionId} className="rounded-[20px] border border-white/8 bg-[#111b2a] px-4 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-medium text-white">{override.forcedName}</div>
                      <div className="mt-1 text-sm text-slate-400">{shortId(override.sessionId, 18)}</div>
                      <div className="mt-2 text-sm text-slate-400">{override.reason || "No reason provided"}</div>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      <div className="text-xs uppercase tracking-[0.24em] text-slate-500">
                        {formatRelativeTime(override.updatedAt)}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="border-white/8 bg-[#0d1624] text-slate-100 hover:bg-white/[0.06]"
                        disabled={pendingAction === `remove-override-${override.sessionId}`}
                        onClick={() => void removeOverride(override.sessionId)}
                      >
                        Clear override
                      </Button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-4">
            <Pagination
              page={overridePage}
              totalPages={overrideTotalPages}
              total={overrideTotal}
              pageSize={overridePageSize}
              onPageChange={setOverridePage}
              onPageSizeChange={(nextSize) => {
                setOverridePageSize(nextSize);
                setOverridePage(1);
              }}
            />
          </div>
        </Surface>
      </div>
    </>
  );
}
