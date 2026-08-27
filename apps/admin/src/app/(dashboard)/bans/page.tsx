"use client";

import { useEffect, useMemo, useState } from "react";
import { Ban, Plus, Search, Shield, Trash2, UserRoundX } from "lucide-react";
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
import { StatTile } from "@/components/ui/stat-tile";
import { Surface } from "@/components/ui/surface";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const BAN_TYPE_OPTIONS = [
  { value: "session", label: "Session ban" },
  { value: "ip", label: "IP ban" },
  { value: "region", label: "Region ban" },
] as const;

function matchesSearch(
  values: Array<string | null | undefined>,
  query: string,
) {
  if (!query) {
    return true;
  }
  return values.some((value) => normalizeSearchText(value).includes(query));
}

/** The tone each ban type wears, from the panel's own status colours. */
const BAN_ACCENT: Record<string, string> = {
  session: "var(--warn)",
  ip: "var(--danger)",
  region: "var(--game-password)",
};

export default function BansPage() {
  const { show } = useToast();
  const confirm = useConfirmDialog();
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [overview, setOverview] = useState<
    DashboardSummaryResponse["summary"]["moderation"] | null
  >(null);

  const [bans, setBans] = useState<BanRecord[]>([]);
  const [restrictedNames, setRestrictedNames] = useState<
    RestrictedNameRecord[]
  >([]);
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
  const [tab, setTab] = useState("bans");

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const [overviewResponse, banResponse, ruleResponse, overrideResponse] =
          await Promise.all([
            api("/dashboard/summary"),
            api(
              `/bans?${new URLSearchParams({ page: String(banPage), pageSize: String(banPageSize) })}`,
            ),
            api(
              `/names/restricted?${new URLSearchParams({ page: String(rulePage), pageSize: String(rulePageSize) })}`,
            ),
            api(
              `/names/overrides?${new URLSearchParams({ page: String(overridePage), pageSize: String(overridePageSize) })}`,
            ),
          ]);

        if (cancelled) {
          return;
        }

        const overviewData = overviewResponse as DashboardSummaryResponse;
        setOverview(overviewData.summary.moderation);

        setBans((banResponse.bans ?? []) as BanRecord[]);
        setBanTotal(banResponse.total ?? 0);
        setBanTotalPages(Math.max(1, banResponse.totalPages ?? 1));

        setRestrictedNames(
          (ruleResponse.restricted ?? []) as RestrictedNameRecord[],
        );
        setRuleTotal(ruleResponse.total ?? 0);
        setRuleTotalPages(Math.max(1, ruleResponse.totalPages ?? 1));

        setOverrides(
          (overrideResponse.overrides ?? []) as NameOverrideRecord[],
        );
        setOverrideTotal(overrideResponse.total ?? 0);
        setOverrideTotalPages(Math.max(1, overrideResponse.totalPages ?? 1));
      } catch (error) {
        if (!cancelled) {
          show(
            error instanceof Error
              ? error.message
              : "Unable to load moderation desk.",
            "error",
          );
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
  }, [
    banPage,
    banPageSize,
    overridePage,
    overridePageSize,
    refreshKey,
    rulePage,
    rulePageSize,
    show,
  ]);

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
      matchesSearch([entry.pattern, entry.reason], normalizedSearch),
    );
  }, [normalizedSearch, restrictedNames]);

  const visibleOverrides = useMemo(() => {
    return overrides.filter((override) =>
      matchesSearch(
        [override.sessionId, override.forcedName, override.reason],
        normalizedSearch,
      ),
    );
  }, [normalizedSearch, overrides]);

  const runAction = async (label: string, action: () => Promise<void>) => {
    setPendingAction(label);
    try {
      await action();
      setRefreshKey((value) => value + 1);
    } catch (error) {
      show(
        error instanceof Error
          ? error.message
          : "Unable to complete that action.",
        "error",
      );
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
      description:
        "This will immediately delete the selected ban entry from the moderation list.",
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
      description:
        "This pattern will stop being enforced for future name validation.",
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
      description:
        "The affected session will go back to using its normal naming flow.",
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
    <div className="flex h-full min-h-0 flex-col gap-3">
      {/* One compact strip instead of five big cards, and Name controls is
          split into its two real numbers rather than an "a / b" string. */}
      <div className="grid shrink-0 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Active bans"
          value={(overview?.totalBans ?? banTotal).toLocaleString()}
          accent="var(--danger)"
          icon={Shield}
          parts={[
            { label: "session", value: overview?.sessionBans ?? 0 },
            { label: "ip", value: overview?.ipBans ?? 0 },
            { label: "region", value: overview?.regionBans ?? 0 },
          ]}
        />
        <StatTile
          label="Name rules"
          value={(overview?.restrictedNames ?? ruleTotal).toLocaleString()}
          accent="var(--game-password)"
          icon={Ban}
        />
        <StatTile
          label="Overrides"
          value={(overview?.nameOverrides ?? overrideTotal).toLocaleString()}
          accent="var(--game-location)"
          icon={UserRoundX}
        />
        <StatTile
          label="Showing"
          value={visibleBans.length.toLocaleString()}
          accent="var(--primary)"
          icon={Search}
          parts={[{ label: "of this page", value: bans.length }]}
        />
      </div>

      {/* Three unrelated datasets used to share one scrolling rail. They are
          three tabs now, so each gets the full width and its own table. */}
      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex min-h-0 flex-1 flex-col gap-3"
      >
        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <TabsList>
            <TabsTrigger value="bans">
              Bans
              <Badge variant="muted" className="ml-1.5 h-4 text-[0.6rem]">
                {banTotal}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="names">
              Name rules
              <Badge variant="muted" className="ml-1.5 h-4 text-[0.6rem]">
                {ruleTotal}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="overrides">
              Overrides
              <Badge variant="muted" className="ml-1.5 h-4 text-[0.6rem]">
                {overrideTotal}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <div className="relative ml-auto w-full max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search values, patterns and reasons"
              className="h-9 pl-9"
            />
          </div>
        </div>

        {/* ── Bans ──────────────────────────────────────────────── */}
        <TabsContent value="bans" className="flex min-h-0 flex-1 flex-col gap-3">
          <Surface pad="sm" className="shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex overflow-hidden rounded-md border border-border">
                {BAN_TYPE_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() =>
                      setNewBan((current) => ({ ...current, type: option.value }))
                    }
                    className={`h-9 px-3 text-xs font-semibold capitalize transition-colors ${
                      newBan.type === option.value
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-muted-foreground hover:bg-accent hover:text-foreground"
                    }`}
                  >
                    {option.value}
                  </button>
                ))}
              </div>

              <Input
                value={newBan.value}
                onChange={(event) =>
                  setNewBan((current) => ({ ...current, value: event.target.value }))
                }
                placeholder={
                  newBan.type === "session"
                    ? "Session id"
                    : newBan.type === "ip"
                      ? "IP address"
                      : "Region code"
                }
                className="h-9 w-56"
              />
              <Input
                value={newBan.reason}
                onChange={(event) =>
                  setNewBan((current) => ({ ...current, reason: event.target.value }))
                }
                placeholder="Reason"
                maxLength={200}
                className="h-9 min-w-0 flex-1"
              />
              <Button
                className="h-9"
                disabled={!newBan.value.trim() || pendingAction === "add-ban"}
                onClick={() => void addBan()}
              >
                <Plus />
                Add ban
              </Button>
            </div>

            <p className="mt-2 text-xs text-muted-foreground">
              Session bans disconnect immediately. IP and region bans block
              re-entry on the next auth cycle.
            </p>
          </Surface>

          <Surface pad="sm" className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <div className="mb-2 flex shrink-0 flex-wrap gap-1.5">
              {(["all", "session", "ip", "region"] as const).map((value) => (
                <Button
                  key={value}
                  type="button"
                  size="xs"
                  variant={banFilter === value ? "default" : "outline"}
                  onClick={() => setBanFilter(value)}
                  className="capitalize"
                >
                  {value === "all" ? "All" : value}
                </Button>
              ))}
            </div>

            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-24">Type</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="w-40">Created</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading && bans.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={5} className="py-4">
                      <div className="space-y-2">
                        {Array.from({ length: 6 }).map((_, index) => (
                          <Skeleton key={index} className="h-10 bg-muted" />
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : visibleBans.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={5}
                      className="h-[30vh] text-center align-middle text-sm text-muted-foreground"
                    >
                      <Shield className="mx-auto mb-2 size-6 opacity-30" />
                      No bans match this filter.
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleBans.map((ban) => (
                    <TableRow key={ban.id}>
                      <TableCell>
                        <Badge
                          variant="accent"
                          accent={BAN_ACCENT[ban.type] ?? "var(--primary)"}
                          className="capitalize"
                        >
                          {ban.type}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-foreground">
                        {ban.value}
                      </TableCell>
                      <TableCell className="max-w-md truncate text-muted-foreground">
                        {ban.reason || "No reason given"}
                      </TableCell>
                      <TableCell
                        className="text-muted-foreground"
                        title={formatDateTime(ban.createdAt)}
                      >
                        {formatRelativeTime(ban.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Remove ${ban.type} ban`}
                          className="text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)]"
                          disabled={pendingAction === `remove-ban-${ban.id}`}
                          onClick={() => void removeBan(ban.id)}
                        >
                          <Trash2 />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Surface>

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
        </TabsContent>

        {/* ── Name rules ────────────────────────────────────────── */}
        <TabsContent value="names" className="flex min-h-0 flex-1 flex-col gap-3">
          <Surface pad="sm" className="shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              <Input
                value={newRule.pattern}
                onChange={(event) =>
                  setNewRule((current) => ({
                    ...current,
                    pattern: event.target.value,
                  }))
                }
                placeholder="Pattern, e.g. admin*"
                className="h-9 w-56 font-mono"
              />
              <Input
                value={newRule.reason}
                onChange={(event) =>
                  setNewRule((current) => ({
                    ...current,
                    reason: event.target.value,
                  }))
                }
                placeholder="Why this name is blocked"
                className="h-9 min-w-0 flex-1"
              />
              <Button
                className="h-9"
                disabled={!newRule.pattern.trim() || pendingAction === "add-name-rule"}
                onClick={() => void addRestrictedName()}
              >
                <Plus />
                Add rule
              </Button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              Exact matches and wildcards both work, and rules are enforced
              server-side.
            </p>
          </Surface>

          <Surface pad="sm" className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-64">Pattern</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="w-40">Added</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleRestrictedNames.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={4}
                      className="h-[30vh] text-center align-middle text-sm text-muted-foreground"
                    >
                      <Ban className="mx-auto mb-2 size-6 opacity-30" />
                      No name rules match this search.
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleRestrictedNames.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="font-mono text-foreground">
                        {entry.pattern}
                      </TableCell>
                      <TableCell className="max-w-md truncate text-muted-foreground">
                        {entry.reason || "No reason given"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatRelativeTime(entry.createdAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Remove name rule"
                          className="text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)]"
                          disabled={pendingAction === `remove-rule-${entry.id}`}
                          onClick={() => void removeRestrictedName(entry.id)}
                        >
                          <Trash2 />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Surface>

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
        </TabsContent>

        {/* ── Overrides ─────────────────────────────────────────── */}
        <TabsContent
          value="overrides"
          className="flex min-h-0 flex-1 flex-col gap-3"
        >
          <Surface pad="sm" className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-48">Forced name</TableHead>
                  <TableHead className="w-56">Session</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="w-40">Updated</TableHead>
                  <TableHead className="w-24 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visibleOverrides.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell
                      colSpan={5}
                      className="h-[30vh] text-center align-middle text-sm text-muted-foreground"
                    >
                      <UserRoundX className="mx-auto mb-2 size-6 opacity-30" />
                      No overrides yet. Create one from a session in Clients.
                    </TableCell>
                  </TableRow>
                ) : (
                  visibleOverrides.map((override) => (
                    <TableRow key={override.sessionId}>
                      <TableCell className="font-medium text-foreground">
                        {override.forcedName}
                      </TableCell>
                      <TableCell className="font-mono text-muted-foreground">
                        {shortId(override.sessionId, 18)}
                      </TableCell>
                      <TableCell className="max-w-md truncate text-muted-foreground">
                        {override.reason || "No reason given"}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {formatRelativeTime(override.updatedAt)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          aria-label="Clear override"
                          className="text-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_14%,transparent)]"
                          disabled={
                            pendingAction === `remove-override-${override.sessionId}`
                          }
                          onClick={() => void removeOverride(override.sessionId)}
                        >
                          <Trash2 />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Surface>

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
        </TabsContent>
      </Tabs>
    </div>
  );
}
