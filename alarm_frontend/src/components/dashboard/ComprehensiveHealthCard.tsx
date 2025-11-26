/**
 * Comprehensive Health Score Card - ISO 18.2 Compliant Multi-Tier Health Display
 * 
 * Displays weighted composite health score (0-100) with four-tier breakdown:
 * - Tier 1: Load Compliance (40% weight) - Daily load, window overload, peak intensity
 * - Tier 2: Alarm Quality (30% weight) - Nuisance/chattering, instrument failures
 * - Tier 3: Operator Response (20% weight) - Standing alarms, response times
 * - Tier 4: System Reliability (10% weight) - Day-to-day consistency
 */

import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Shield,
  Activity,
  Users,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Info,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  XCircle
} from 'lucide-react';
import { useState } from 'react';
import type { ComprehensiveHealthScore } from '@/types/actualCalc';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { HealthScoreDetailsModal } from './HealthScoreDetailsModal';

interface Props {
  healthScore: ComprehensiveHealthScore;
  loading?: boolean;
}

export default function ComprehensiveHealthCard({ healthScore, loading }: Props) {
  const [detailsOpen, setDetailsOpen] = useState(false);

  if (loading) {
    return (
      <Card className="shadow-metric-card">
        <CardHeader>
          <CardTitle className="text-base font-semibold">Comprehensive Health Score</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  const { overall_health, grade, risk_level, tier_scores, sub_scores, interpretation } = healthScore;

  // Color mapping for grade and risk level
  const getGradeColor = (grade: string): string => {
    if (grade.startsWith('A')) return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    if (grade.startsWith('B')) return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    if (grade.startsWith('C')) return 'bg-amber-500/10 text-amber-600 border-amber-500/20';
    if (grade === 'D') return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
    return 'bg-red-500/10 text-red-600 border-red-500/20';
  };

  const getRiskIcon = (risk: string) => {
    if (risk === 'Excellent') return <CheckCircle2 className="h-5 w-5 text-emerald-500" />;
    if (risk === 'Good') return <Activity className="h-5 w-5 text-blue-500" />;
    if (risk === 'Acceptable') return <AlertTriangle className="h-5 w-5 text-amber-500" />;
    if (risk === 'Overloaded') return <AlertCircle className="h-5 w-5 text-orange-500" />;
    return <XCircle className="h-5 w-5 text-red-500" />;
  };

  const getScoreColor = (score: number): string => {
    if (score >= 90) return 'text-emerald-600';
    if (score >= 75) return 'text-blue-600';
    if (score >= 60) return 'text-amber-600';
    if (score >= 40) return 'text-orange-600';
    return 'text-red-600';
  };

  const getProgressColor = (score: number): string => {
    if (score >= 90) return '[&>div]:bg-emerald-500';
    if (score >= 75) return '[&>div]:bg-blue-500';
    if (score >= 60) return '[&>div]:bg-amber-500';
    if (score >= 40) return '[&>div]:bg-orange-500';
    return '[&>div]:bg-red-500';
  };

  const tiers = [
    {
      name: 'Load Compliance',
      icon: Activity,
      score: tier_scores.load_compliance,
      weight: '40%',
      description: 'Daily alarm rates, window overload, peak intensity',
      subScores: [
        { name: 'Daily Load', score: sub_scores?.daily_load_score ?? 0, weight: '50%' },
        { name: 'Window Overload', score: sub_scores?.window_overload_score ?? 0, weight: '30%' },
        { name: 'Peak Intensity', score: sub_scores?.peak_intensity_score ?? 0, weight: '20%' },
      ]
    },
    {
      name: 'Alarm Quality',
      icon: Shield,
      score: tier_scores.alarm_quality,
      weight: '30%',
      description: 'Nuisance alarms, chattering, instrument failures',
      subScores: [
        { name: 'Nuisance Control', score: sub_scores?.nuisance_score ?? 0, weight: '60%' },
        { name: 'Instrument Health', score: sub_scores?.instrument_health_score ?? 0, weight: '40%' },
      ]
    },
    {
      name: 'Operator Response',
      icon: Users,
      score: tier_scores.operator_response,
      weight: '20%',
      description: 'Standing alarm management, response times',
      subScores: [
        { name: 'Standing Control', score: sub_scores?.standing_control_score ?? 0, weight: '50%' },
        { name: 'Response Speed', score: sub_scores?.response_score ?? 0, weight: '50%' },
      ]
    },
    {
      name: 'System Reliability',
      icon: TrendingUp,
      score: tier_scores.system_reliability,
      weight: '10%',
      description: 'Day-to-day consistency in alarm patterns',
      subScores: [
        { name: 'Consistency', score: sub_scores?.consistency_score ?? 0, weight: '100%' },
      ]
    }
  ];

  return (
    <Card className="shadow-metric-card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CardTitle className="text-base font-semibold">Comprehensive Health Score</CardTitle>
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent className="max-w-xs">
                  <p className="text-sm">ISO 18.2 compliant multi-tier health assessment. Weighted composite of load compliance (40%), alarm quality (30%), operator response (20%), and system reliability (10%).</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>
          <button
            onClick={() => setDetailsOpen(true)}
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            More Details
            <ChevronDown className="h-3 w-3 -rotate-90" />
          </button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Overall Score Display */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          <div className="space-y-3">
            <div className="flex items-baseline gap-3">
              <div className={`text-5xl font-bold ${getScoreColor(overall_health ?? 0)}`}>
                {(overall_health ?? 0).toFixed(1)}
              </div>
              <div className="text-xl text-muted-foreground">/100</div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={`${getGradeColor(grade)} font-semibold px-3 py-1`}>
                Grade {grade}
              </Badge>
              <div className="flex items-center gap-1.5">
                {getRiskIcon(risk_level)}
                <span className="text-sm font-medium text-muted-foreground">{risk_level}</span>
              </div>
            </div>
            <Progress
              value={Math.max(0, Math.min(100, overall_health ?? 0))}
              className={`h-3 ${getProgressColor(overall_health ?? 0)}`}
            />
          </div>

          <div className="flex items-center">
            <p className="text-sm text-muted-foreground italic">
              "{interpretation}"
            </p>
          </div>
        </div>

        {/* Tier Breakdown */}
        <div className="space-y-3">
          <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            Tier Breakdown
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {tiers.map((tier) => (
              <div key={tier.name} className="border rounded-lg p-3 bg-card/50">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <tier.icon className="h-4 w-4 text-muted-foreground" />
                    <span className="text-sm font-medium">{tier.name}</span>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <span className="text-xs text-muted-foreground">({tier.weight})</span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p className="text-xs">{tier.description}</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <span className={`text-sm font-bold ${getScoreColor(tier.score ?? 0)}`}>
                    {(tier.score ?? 0).toFixed(1)}
                  </span>
                </div>
                <Progress
                  value={Math.max(0, Math.min(100, tier.score ?? 0))}
                  className={`h-1.5 ${getProgressColor(tier.score ?? 0)}`}
                />


              </div>
            ))}
          </div>
        </div>

        {/* ISO Reference Footer */}
        <div className="mt-4 pt-4 border-t flex items-center justify-between text-xs text-muted-foreground">
          <span>ISO 18.2 / EEMUA 191 Compliant</span>
          <span>Multi-tier weighted assessment</span>
        </div>
      </CardContent>

      <HealthScoreDetailsModal
        open={detailsOpen}
        onOpenChange={setDetailsOpen}
        healthScore={healthScore}
      />
    </Card >
  );
}
