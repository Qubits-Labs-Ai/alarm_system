/**
 * KPI Formulas Configuration
 * Centralized definition of all KPI calculation formulas for ActualCalc mode  
 * Each formula includes WHAT the metric is and HOW it's calculated
 */

export interface KPIFormula {
    id: string;
    title: string;
    formula: React.ReactNode;
}

export const KPI_FORMULAS: Record<string, KPIFormula> = {
    // ===== Alarm Summary Section =====
    total_alarms: {
        id: 'total_alarms',
        title: 'Total Alarms Calculation',
        formula: (
            <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-foreground">What: Unique alarm activations</p>
                <p className="text-[11px] text-muted-foreground">Count each alarm start from all sources (when blank action occurs while IDLE/ACKED)</p>
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Total = Count(activation events)</code></p>
                <p className="text-[11px] text-muted-foreground">Activation = transition from IDLE{'\u2192'}ACTIVE or ACKED{'\u2192'}ACTIVE</p>
            </div>
        ),
    },

    total_flood_alarms: {
        id: 'total_flood_alarms',
        title: 'Total Flood Alarms Calculation',
        formula: (
            <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-foreground">What: Alarms during system-wide overload</p>
                <p className="text-[11px] text-muted-foreground">Step 1: Find flood windows (10-min periods with {'\u2265'}2 sources unhealthy)</p>
                <p className="text-[11px] text-muted-foreground">Step 2: Sum all alarm activations within those windows</p>
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Flood Alarms = Σ(alarms in flood windows)</code></p>
            </div>
        ),
    },

    standing_alarms: {
        id: 'standing_alarms',
        title: 'Standing Alarms Calculation',
        formula: (
            <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-foreground">What: Alarms active for extended time before acknowledgment</p>
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Standing = Count where duration_active {'\u2265'} 60 min</code></p>
                <p className="text-[11px] text-muted-foreground">duration_active = time from activation until ACK or RTN</p>
                <p className="text-[11px] text-muted-foreground">Checked at each event: if duration {'\u2265'} stale_min (60), mark as standing</p>
            </div>
        ),
    },

    nuisance_repeating: {
        id: 'nuisance_repeating',
        title: 'Nuisance/Repeating Alarms Calculation',
        formula: (
            <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-foreground">What: Alarms repeating within short time window</p>
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Nuisance = Chattering + IF_Chattering</code></p>
                <p className="text-[11px] text-muted-foreground">Chattering: {'\u2265'}3 activations within sliding 10-min window</p>
                <p className="text-[11px] text-muted-foreground">IF_Chattering: Same as chattering but Condition contains FAIL/BAD keywords</p>
            </div>
        ),
    },

    // ===== Frequency Metrics Section =====
    alarm_rate_daily: {
        id: 'alarm_rate_daily',
        title: 'Daily Alarm Rate Calculation',
        formula: (
            <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-foreground">What: ISO/EEMUA 191 daily alarm average</p>
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Daily Rate = total_alarms ÷ days_analyzed</code></p>
                <p className="text-[11px] text-muted-foreground">days_analyzed = (max_date - min_date).days</p>
                <p className="text-[11px] text-muted-foreground">Target: {'\u003c'}288/day (acceptable), {'\u2265'}720/day (critical overload)</p>
            </div>
        ),
    },

    alarm_rate_hourly: {
        id: 'alarm_rate_hourly',
        title: 'Hourly Alarm Rate Calculation',
        formula: (
            <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-foreground">What: ISO/EEMUA 191 hourly alarm average</p>
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Hourly Rate = total_alarms ÷ (days × 24)</code></p>
                <p className="text-[11px] text-muted-foreground">Divides total alarms by total hours in period</p>
                <p className="text-[11px] text-muted-foreground">Target: {'\u003c'}12/hour (acceptable), {'\u2265'}30/hour (critical)</p>
            </div>
        ),
    },

    alarm_rate_10min: {
        id: 'alarm_rate_10min',
        title: '10-Minute Alarm Rate Calculation',
        formula: (
            <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-foreground">What: ISO/EEMUA 191 ten-minute window average</p>
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">10min Rate = total_alarms ÷ (days × 144)</code></p>
                <p className="text-[11px] text-muted-foreground">144 = windows per day (24 hours × 6 windows/hour)</p>
                <p className="text-[11px] text-muted-foreground">Target: {'\u003c'}2/10min averages to safe daily rate</p>
            </div>
        ),
    },

    isa_compliance: {
        id: 'isa_compliance',
        title: 'ISA Compliance Calculation',
        formula: (
            <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-foreground">What: ISA 18.2 Standard - Acceptable alarm days</p>
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">ISA % = (days_under_288 ÷ total_days) × 100</code></p>
                <p className="text-[11px] text-muted-foreground">Count days where daily_alarm_count {'\u003c'} 288</p>
                <p className="text-[11px] text-muted-foreground">Target: {'\u003e'}90% of days should be compliant</p>
            </div>
        ),
    },

    critical_overload: {
        id: 'critical_overload',
        title: 'Critical Overload Calculation',
        formula: (
            <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-foreground">What: Days exceeding critical alarm threshold</p>
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Critical % = (days_{'\u2265'}720 ÷ total_days) × 100</code></p>
                <p className="text-[11px] text-muted-foreground">Count days where daily_alarm_count {'\u2265'} 720 (30/hour)</p>
                <p className="text-[11px] text-muted-foreground">Target: 0% - critically overloaded days should not exist</p>
            </div>
        ),
    },

    // ===== Detailed Analytics Section =====
    unhealthy_periods: {
        id: 'unhealthy_periods',
        title: 'Unhealthy Periods Calculation',
        formula: (
            <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-foreground">What: Per-source high-intensity 10-minute windows</p>
                <p className="text-[11px] text-muted-foreground">Step 1: For each source, use sliding 10-min window</p>
                <p className="text-[11px] text-muted-foreground">Step 2: Count alarms in window at each activation</p>
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Unhealthy = Σ(windows where count {'\u2265'} 10)</code></p>
                <p className="text-[11px] text-muted-foreground">Sum unhealthy windows across all sources</p>
            </div>
        ),
    },

    flood_windows: {
        id: 'flood_windows',
        title: 'Flood Windows Calculation',
        formula: (
            <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-foreground">What: System-wide stress periods (multi-source overload)</p>
                <p className="text-[11px] text-muted-foreground">Step 1: Identify unhealthy periods per source</p>
                <p className="text-[11px] text-muted-foreground">Step 2: Find time overlaps between sources</p>
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Flood = Count(periods with {'\u2265'}2 overlapping sources)</code></p>
                <p className="text-[11px] text-muted-foreground">Indicates system-wide issues vs isolated problems</p>
            </div>
        ),
    },

    bad_actors: {
        id: 'bad_actors',
        title: 'Bad Actors Calculation',
        formula: (
            <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-foreground">What: Sources contributing most to flood events</p>
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Score = flood_alarms + (flood_windows_involved × 10)</code></p>
                <p className="text-[11px] text-muted-foreground">Rank sources by weighted contribution to system stress</p>
                <p className="text-[11px] text-muted-foreground">Higher score = source drives more flood events</p>
            </div>
        ),
    },

    // ===== Tree Structure Nodes =====
    tree_total_alarms: {
        id: 'tree_total_alarms',
        title: 'Total Alarms (Root Node)',
        formula: (
            <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-foreground">What: All unique alarm activations (tree root)</p>
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Total = Count(blank action while IDLE/ACKED)</code></p>
                <p className="text-[11px] text-muted-foreground">Root splits into: Standing + Nuisance + Flood + Other</p>
            </div>
        ),
    },

    tree_standing: {
        id: 'tree_standing',
        title: 'Standing Alarms',
        formula: (
            <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-foreground">What: Alarms active {'\u003e'}60 min before ACK/RTN</p>
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Standing = Count where (time_active {'\u2265'} 60 min)</code></p>
                <p className="text-[11px] text-muted-foreground">time_active = activation to acknowledgment/return-to-normal</p>
                <p className="text-[11px] text-muted-foreground">Sub-categories: Stale (unacknowledged) + Instruments Faulty</p>
            </div>
        ),
    },

    tree_nuisance: {
        id: 'tree_nuisance',
        title: 'Nuisance/Repeating Alarms',
        formula: (
            <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-foreground">What: Alarms with {'\u2265'}3 activations in 10-min window</p>
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Nuisance = Chattering + IF_Chattering</code></p>
                <p className="text-[11px] text-muted-foreground">Sliding window checks: if count {'\u2265'} 3 within 10 min, mark as chattering episode</p>
                <p className="text-[11px] text-muted-foreground">Sub-categories: Chattering (operational) + IF_Chattering (faulty instrument)</p>
            </div>
        ),
    },

    tree_instruments_faulty: {
        id: 'tree_instruments_faulty',
        title: 'Instruments Faulty (Standing)',
        formula: (
            <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-foreground">What: Standing alarms from faulty instruments</p>
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">IF_Standing = Standing AND Condition contains (FAIL/BAD)</code></p>
                <p className="text-[11px] text-muted-foreground">Subset of Standing where alarm Condition indicates instrument failure</p>
            </div>
        ),
    },

    tree_stale: {
        id: 'tree_stale',
        title: 'Stale Alarms',
        formula: (
            <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-foreground">What: Standing alarms that remain unacknowledged</p>
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Stale = Standing AND NOT instrument_failure</code></p>
                <p className="text-[11px] text-muted-foreground">Active {'\u003e'}60 min without ACK, not flagged as instrument issue</p>
                <p className="text-[11px] text-muted-foreground">Operational problem requiring operator attention</p>
            </div>
        ),
    },

    tree_chattering: {
        id: 'tree_chattering',
        title: 'Chattering Alarms',
        formula: (
            <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-foreground">What: Operational alarms repeating rapidly</p>
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">Chattering = Episodes where ({'\u2265'}3 activations in 10 min)</code></p>
                <p className="text-[11px] text-muted-foreground">Uses sliding window: evict times {'\u003e'}10 min old, count episode when {'\u2265'}3</p>
                <p className="text-[11px] text-muted-foreground">Operational issues (not instrument failures)</p>
            </div>
        ),
    },

    tree_instruments_faulty_chattering: {
        id: 'tree_instruments_faulty_chattering',
        title: 'Instruments Faulty (Chattering)',
        formula: (
            <div className="space-y-1.5">
                <p className="text-[11px] font-semibold text-foreground">What: Chattering alarms from faulty instruments</p>
                <p><code className="bg-muted px-1 py-0.5 rounded font-mono text-xs">IF_Chat = Chattering AND Condition contains (FAIL/BAD)</code></p>
                <p className="text-[11px] text-muted-foreground">Rapid repeating caused by instrument failures</p>
                <p className="text-[11px] text-muted-foreground">Requires instrument maintenance/replacement</p>
            </div>
        ),
    },
};
