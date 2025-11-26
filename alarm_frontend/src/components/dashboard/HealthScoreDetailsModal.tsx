import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Activity, Shield, Users, TrendingUp, Calculator } from "lucide-react";
import type { ComprehensiveHealthScore } from "@/types/actualCalc";

interface HealthScoreDetailsModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    healthScore: ComprehensiveHealthScore;
}

export function HealthScoreDetailsModal({
    open,
    onOpenChange,
    healthScore,
}: HealthScoreDetailsModalProps) {
    const { overall_health, tier_scores, sub_scores } = healthScore;

    const getScoreColor = (score: number) => {
        if (score >= 90) return "text-emerald-600";
        if (score >= 75) return "text-blue-600";
        if (score >= 60) return "text-amber-600";
        if (score >= 40) return "text-orange-600";
        return "text-red-600";
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2 text-xl">
                        <Calculator className="h-5 w-5 text-primary" />
                        Health Score Details
                    </DialogTitle>
                    <DialogDescription>
                        Detailed calculation logic and formula definitions for the ISO 18.2 compliant health score.
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-1 overflow-hidden">
                    <ScrollArea className="h-full pr-4">
                        <div className="space-y-6 pb-6">
                            {/* Overall Formula Section */}
                            <Card className="bg-muted/30 border-primary/20">
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base font-semibold flex items-center justify-between">
                                        <span>Overall Health Score Calculation</span>
                                        <span className={`text-2xl font-bold ${getScoreColor(overall_health ?? 0)}`}>
                                            {(overall_health ?? 0).toFixed(1)}
                                        </span>
                                    </CardTitle>
                                </CardHeader>
                                <CardContent>
                                    <div className="space-y-3">
                                        <div className="p-3 bg-background rounded-md border font-mono text-sm shadow-sm">
                                            Health Score = (Load × 0.40) + (Quality × 0.30) + (Response × 0.20) + (Reliability × 0.10)
                                        </div>
                                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                                            <div className="flex flex-col">
                                                <span className="text-muted-foreground">Load Compliance</span>
                                                <span className="font-medium">{(tier_scores?.load_compliance ?? 0).toFixed(1)} × 40%</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-muted-foreground">Alarm Quality</span>
                                                <span className="font-medium">{(tier_scores?.alarm_quality ?? 0).toFixed(1)} × 30%</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-muted-foreground">Operator Response</span>
                                                <span className="font-medium">{(tier_scores?.operator_response ?? 0).toFixed(1)} × 20%</span>
                                            </div>
                                            <div className="flex flex-col">
                                                <span className="text-muted-foreground">System Reliability</span>
                                                <span className="font-medium">{(tier_scores?.system_reliability ?? 0).toFixed(1)} × 10%</span>
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>

                            <Tabs defaultValue="tier1" className="w-full">
                                <TabsList className="grid w-full grid-cols-4">
                                    <TabsTrigger value="tier1" className="flex items-center gap-2">
                                        <Activity className="h-4 w-4" /> Load
                                    </TabsTrigger>
                                    <TabsTrigger value="tier2" className="flex items-center gap-2">
                                        <Shield className="h-4 w-4" /> Quality
                                    </TabsTrigger>
                                    <TabsTrigger value="tier3" className="flex items-center gap-2">
                                        <Users className="h-4 w-4" /> Response
                                    </TabsTrigger>
                                    <TabsTrigger value="tier4" className="flex items-center gap-2">
                                        <TrendingUp className="h-4 w-4" /> Reliability
                                    </TabsTrigger>
                                </TabsList>

                                {/* Tier 1: Load Compliance */}
                                <TabsContent value="tier1" className="space-y-4 mt-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-lg font-semibold flex items-center gap-2">
                                            <Activity className="h-5 w-5 text-blue-500" />
                                            Tier 1: Load Compliance (40% Weight)
                                        </h3>
                                        <Badge variant="outline" className="text-base px-3">
                                            Score: {(tier_scores?.load_compliance ?? 0).toFixed(1)}
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        Evaluates the volume and intensity of alarms presented to operators. High load leads to operator fatigue and missed critical alarms.
                                    </p>

                                    <div className="grid gap-4">
                                        <FormulaCard
                                            title="Daily Load Score"
                                            weight="50%"
                                            score={sub_scores?.daily_load_score}
                                            formula="100 - ((Avg Daily Alarms - Target) / (Critical - Target) × 100)"
                                            definition="Measures average daily alarm rate against ISO 18.2 benchmarks. Target: <150/day (Score 100). Critical: >300/day (Score 0)."
                                        />
                                        <FormulaCard
                                            title="Window Overload Score"
                                            weight="30%"
                                            score={sub_scores?.window_overload_score}
                                            formula="100 - (% Time in Flood/Overload State)"
                                            definition="Percentage of time the system is NOT in a flood or overload state. Higher is better."
                                        />
                                        <FormulaCard
                                            title="Peak Intensity Score"
                                            weight="20%"
                                            score={sub_scores?.peak_intensity_score}
                                            formula="Based on Peak 10-min Alarm Rate"
                                            definition="Penalizes extreme bursts of alarms. Score degrades as peak 10-minute rate exceeds manageable limits (e.g., >10 alarms/10min)."
                                        />
                                    </div>
                                </TabsContent>

                                {/* Tier 2: Alarm Quality */}
                                <TabsContent value="tier2" className="space-y-4 mt-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-lg font-semibold flex items-center gap-2">
                                            <Shield className="h-5 w-5 text-emerald-500" />
                                            Tier 2: Alarm Quality (30% Weight)
                                        </h3>
                                        <Badge variant="outline" className="text-base px-3">
                                            Score: {(tier_scores?.alarm_quality ?? 0).toFixed(1)}
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        Assesses the "health" of the alarm signals themselves. Poor quality alarms (chattering, nuisance) reduce trust in the system.
                                    </p>

                                    <div className="grid gap-4">
                                        <FormulaCard
                                            title="Nuisance Control Score"
                                            weight="60%"
                                            score={sub_scores?.nuisance_score}
                                            formula="100 - (% Nuisance Alarms × Penalty Factor)"
                                            definition="Measures the prevalence of nuisance alarms (chattering, fleeting). Target is 0% nuisance alarms."
                                        />
                                        <FormulaCard
                                            title="Instrument Health Score"
                                            weight="40%"
                                            score={sub_scores?.instrument_health_score}
                                            formula="100 - (% Instrument Failure Alarms × Penalty Factor)"
                                            definition="Impact of alarms caused by known instrument failures or bad data quality."
                                        />
                                    </div>
                                </TabsContent>

                                {/* Tier 3: Operator Response */}
                                <TabsContent value="tier3" className="space-y-4 mt-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-lg font-semibold flex items-center gap-2">
                                            <Users className="h-5 w-5 text-amber-500" />
                                            Tier 3: Operator Response (20% Weight)
                                        </h3>
                                        <Badge variant="outline" className="text-base px-3">
                                            Score: {(tier_scores?.operator_response ?? 0).toFixed(1)}
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        Reflects how effectively operators are managing the alarms that occur.
                                    </p>

                                    <div className="grid gap-4">
                                        <FormulaCard
                                            title="Standing Control Score"
                                            weight="50%"
                                            score={sub_scores?.standing_control_score}
                                            formula="Based on Count of Standing Alarms"
                                            definition="Penalizes the accumulation of standing (stale) alarms. Target: <5 standing alarms. Critical: >20."
                                        />
                                        <FormulaCard
                                            title="Response Speed Score"
                                            weight="50%"
                                            score={sub_scores?.response_score}
                                            formula="Based on Avg Acknowledge Time"
                                            definition="Evaluates how quickly operators acknowledge new alarms. Target: <5 mins. Critical: >30 mins."
                                        />
                                    </div>
                                </TabsContent>

                                {/* Tier 4: System Reliability */}
                                <TabsContent value="tier4" className="space-y-4 mt-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-lg font-semibold flex items-center gap-2">
                                            <TrendingUp className="h-5 w-5 text-purple-500" />
                                            Tier 4: System Reliability (10% Weight)
                                        </h3>
                                        <Badge variant="outline" className="text-base px-3">
                                            Score: {(tier_scores?.system_reliability ?? 0).toFixed(1)}
                                        </Badge>
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        Measures the consistency and predictability of the alarm system's behavior over time.
                                    </p>

                                    <div className="grid gap-4">
                                        <FormulaCard
                                            title="Consistency Score"
                                            weight="100%"
                                            score={sub_scores?.consistency_score}
                                            formula="100 - (Coefficient of Variation × 100)"
                                            definition="Measures day-to-day variance in alarm loads. High variance indicates an unstable or unpredictable system."
                                        />
                                    </div>
                                </TabsContent>
                            </Tabs>
                        </div>
                    </ScrollArea>
                </div>
            </DialogContent>
        </Dialog>
    );
}

function FormulaCard({
    title,
    weight,
    score,
    formula,
    definition,
}: {
    title: string;
    weight: string;
    score: number | undefined | null;
    formula: string;
    definition: string;
}) {
    const safeScore = typeof score === 'number' ? score : 0;


    const getScoreColor = (score: number) => {
        if (score >= 90) return "text-emerald-600";
        if (score >= 75) return "text-blue-600";
        if (score >= 60) return "text-amber-600";
        if (score >= 40) return "text-orange-600";
        return "text-red-600";
    };

    return (
        <div className="border rounded-lg p-4 bg-card hover:bg-accent/5 transition-colors">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <span className="font-semibold text-sm">{title}</span>
                    <Badge variant="secondary" className="text-xs font-normal">
                        Weight: {weight}
                    </Badge>
                </div>
                <span className={`font-bold ${getScoreColor(safeScore)}`}>{safeScore.toFixed(1)}</span>
            </div>
            <div className="space-y-2">
                <div className="bg-muted/50 p-2 rounded text-xs font-mono border border-border/50">
                    {formula}
                </div>
                <p className="text-xs text-muted-foreground">{definition}</p>
            </div>
        </div>
    );
}
