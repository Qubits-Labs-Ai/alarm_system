# PVCI Plant-Wide ISA 18.2 Mode - Technical Analysis Report

## Executive Summary

This report provides a comprehensive technical analysis of the PVCI (PVC-I) Plant-Wide ISA 18.2 mode implementation in the alarm management system. The system implements ISA-18.2 plant-wide alarm flooding analysis, providing sliding-window flood detection, health metrics, and comprehensive data visualization for alarm management optimization.

## 1. System Architecture Overview

### 1.1 High-Level Architecture
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   CSV Data      │    │   Backend API   │    │   Frontend UI   │
│   Sources       │───▶│   (FastAPI)     │───▶│   (React/TS)    │
│                 │    │                 │    │                 │
│ - Event Time    │    │ - Data Parsing  │    │ - Dashboards    │
│ - Location Tag  │    │ - Calculations  │    │ - Charts        │
│ - Source        │    │ - ISA Analysis  │    │ - Controls      │
│ - Condition     │    │ - API Endpoints │    │ - Insights      │
│ - Priority      │    │ - Caching       │    │ - Filtering     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### 1.2 Core Components
- **Data Layer**: CSV files containing alarm event data
- **Processing Engine**: Python-based calculation and analysis modules  
- **API Layer**: FastAPI REST endpoints with caching
- **Frontend**: React/TypeScript SPA with interactive visualizations
- **Configuration**: Environment-based settings and plant mappings

## 2. Backend Implementation Analysis

### 2.1 Data Sources & Configuration

**Primary Configuration** (`config.py`):
```python
ALARM_DATA_DIR = os.path.join(os.path.dirname(__file__), "ALARM_DATA_DIR")
PVCI_FOLDER = os.path.join(ALARM_DATA_DIR, "PVC-I (Jan, Feb, Mar) EVENTS")
```

**Data Structure** (CSV format):
- **Event Time**: Timestamp of alarm occurrence
- **Location Tag**: Plant location identifier
- **Source**: Alarm source identifier
- **Condition**: Alarm condition type
- **Action**: Recommended action
- **Priority**: Alarm priority level
- **Description**: Human-readable description
- **Value**: Process value
- **Units**: Measurement units

### 2.2 Core Processing Modules

#### 2.2.1 Health Monitoring Engine (`pvcI_health_monitor.py`)

**Key Components:**
- **HealthConfig Class**: Configurable parameters for analysis
  ```python
  class HealthConfig:
      bin_size: str = '10min'           # Time window size
      alarm_threshold: int = 10         # Flood threshold
      bins_per_day: int = 144          # Expected bins per day
      skip_rows: int = 8               # CSV header rows to skip
  ```

- **Smart CSV Reader** (`read_csv_smart`):
  - Automatic separator detection (comma/tab)
  - Chunked processing for large files
  - Memory-efficient reading with caching
  - Error handling and fallback mechanisms

- **Fixed Bin Grouping** (`group_events_by_source_with_timegap`):
  - Groups events into 10-minute time windows
  - Calculates hits per window
  - Computes rates and durations
  - Non-overlapping bin strategy

- **Dynamic Flood Detection** (`detect_flood_events_for_source`):
  - Sliding window flood detection using deque
  - Merges overlapping flood intervals
  - Tracks peak window details
  - Rate calculations per minute

#### 2.2.2 ISA 18.2 Flood Monitor (`isa18_flood_monitor.py`)

**Core Functions:**

1. **Plant-Wide Timestamp Aggregation**:
   ```python
   def _read_event_times_for_file(file_path: str) -> List[datetime]
   ```
   - Reads all event timestamps from CSV files
   - UTC normalization and sorting
   - Error handling for malformed data

2. **Flood Interval Detection**:
   ```python
   def _detect_flood_intervals(timestamps, window_minutes, threshold)
   ```
   - Implements ISA-18.2 sliding window algorithm
   - Strict threshold enforcement (count > threshold)
   - Merges adjacent flood periods
   - Tracks peak activity windows

3. **Per-Day Breakdown**:
   ```python
   def _by_day_breakdown(intervals, obs_start, obs_end, window_minutes, peak_count)
   ```
   - Calculates daily flood duration
   - Percentage time in flood state
   - ISA health percentage metrics

4. **Enhanced Aggregation**:
   - Pre-computed location/condition breakdowns
   - Top sources analysis
   - System vs. operational source filtering

### 2.3 API Endpoints

#### 2.3.1 Primary ISA Endpoints

**1. Enhanced ISA Flood Summary**
```
GET /pvcI-health/isa-flood-summary-enhanced
```
- **Purpose**: Main plant-wide flood analysis endpoint
- **Parameters**:
  - `window_minutes`: Analysis window size (default: 10)
  - `threshold`: Flood threshold (default: 10)
  - `start_time`/`end_time`: Optional time range
  - `include_enhanced`: Enable pre-computed aggregations
  - `top_locations`/`top_sources_per_condition`: Result limits

- **Response Structure**:
  ```json
  {
    "plant_folder": "string",
    "generated_at": "ISO datetime",
    "overall": {
      "total_observation_duration_min": number,
      "total_alarms": number,
      "flood_windows_count": number,
      "flood_duration_min": number,
      "percent_time_in_flood": number,
      "isa_overall_health_pct": number,
      "peak_10min_count": number,
      "compliance": {
        "target": "<1% time in flood",
        "value": number,
        "meets": boolean
      }
    },
    "by_day": [array of daily metrics],
    "records": [flood interval details],
    "condition_distribution_by_location": object,
    "unique_sources_summary": object,
    "unhealthy_sources_top_n": object,
    "event_statistics": object
  }
  ```

**2. Unhealthy Sources Analysis**
```
GET /pvcI-health/unhealthy-sources
```
- **Purpose**: Per-source unhealthy bin analysis
- **Features**:
  - Time range filtering
  - Aggregation by source
  - System source filtering
  - Pagination and limits

**3. Window Source Details**
```
GET /pvcI-health/window-source-details
```
- **Purpose**: Detailed analysis for specific time windows
- **Returns**: Per-source event counts within specified window

### 2.4 Caching Strategy

**Multi-Level Caching**:
1. **Pre-computed JSON Files**:
   - `PVCI-overall-health/isa18-flood-summary-enhanced.json`
   - Updated periodically via background processes
   - Contains full analysis results

2. **In-Memory LRU Cache**:
   - `@lru_cache` decorators on expensive functions
   - CSV parsing results cached per file

3. **API Response Caching**:
   - 15-30 minute TTL on most endpoints
   - Conditional cache invalidation

## 3. Frontend Implementation Analysis

### 3.1 Architecture Pattern

**Technology Stack**:
- **React 18** with TypeScript
- **TanStack Query** for API state management
- **React Router** for navigation
- **Recharts** for data visualization
- **Tailwind CSS** for styling

### 3.2 Core Components

#### 3.2.1 Dashboard Page (`DashboardPage.tsx`)

**State Management**:
```typescript
// Plant selection and mode
const [selectedPlant, setSelectedPlant] = useState<Plant>(defaultPlant);
const [mode, setMode] = useState<'perSource' | 'flood'>('flood');

// ISA range filtering
const [isaRange, setIsaRange] = useState<{ startTime?: string; endTime?: string }>();

// Window selection for detailed analysis
const [selectedWindow, setSelectedWindow] = useState<{
  id: string; label: string; start: string; end: string;
} | null>(null);

// System source filtering
const [includeSystem, setIncludeSystem] = useState<boolean>(true);
```

**Key Features**:
- **Mode Switching**: Per-source vs. Plant-wide (ISA 18.2)
- **Time Range Selection**: Custom observation periods
- **Dynamic Window Analysis**: Click-to-drill-down functionality
- **Real-time Filtering**: Include/exclude system sources

#### 3.2.2 Plant Health Hook (`usePlantHealth.ts`)

**Query Implementation**:
```typescript
export function usePlantHealth(
  plantId: string = 'pvcI',
  topN: 1 | 3 = 1,
  mode: 'perSource' | 'flood' = 'perSource',
  refetchInterval: false | number = false,
  range?: { startTime?: string; endTime?: string }
)
```

**Mode-Specific Data Fetching**:
- **Flood Mode**: Calls `fetchPvciIsaFloodSummaryEnhanced`
- **Per-Source Mode**: Uses traditional health metrics
- **Automatic Transformation**: Raw API data → UI-friendly format

#### 3.2.3 Key Visualization Components

**1. Top Flood Windows Chart**:
- Displays highest-impact 10-minute flood windows
- Interactive selection for detailed analysis
- Sortable by flood count or time

**2. Unhealthy Sources Bar Chart**:
- Shows top problematic sources
- Supports both per-source and flood modes
- Time picker integration for window analysis

**3. Condition Distribution Charts**:
- Stacked bar charts by location
- Categorized by alarm conditions
- System vs. operational source filtering

**4. Event Statistics Cards**:
- Key performance indicators
- ISA compliance metrics
- Plant-wide health summary

### 3.3 API Integration

#### 3.3.1 Caching Strategy (`plantHealth.ts`)

**Multi-Layer Caching**:
```typescript
// Memory cache
const memCache = new Map<string, CacheEntry>();

// LocalStorage persistence
const STORAGE_PREFIX = 'ams.apiCache.v1:';

// In-flight deduplication
const inflight = new Map<string, Promise<any>>();
```

**TTL Management**:
- **ISA Summary**: 30 minutes (infrequent changes)
- **Window Details**: 5 minutes (specific queries)
- **Plant List**: 60 minutes (rarely changes)

#### 3.3.2 Enhanced API Calls

**Primary Enhanced Endpoint**:
```typescript
export async function fetchPvciIsaFloodSummaryEnhanced(params?: {
  window_minutes?: number;
  threshold?: number;
  start_time?: string;
  end_time?: string;
  include_enhanced?: boolean;
  timeout_ms?: number;
})
```

**Features**:
- Pre-computed aggregations (90%+ performance improvement)
- Optional lite mode for faster loading
- Configurable timeouts
- Automatic error handling with fallbacks

## 4. ISA 18.2 Implementation Details

### 4.1 Sliding Window Algorithm

**Core Logic**:
```python
def _detect_flood_intervals(timestamps, window_minutes, threshold):
    dq: deque[datetime] = deque()
    win = timedelta(minutes=int(window_minutes))
    
    for t in timestamps:
        dq.append(t)
        while dq and (dq[-1] - dq[0]) > win:
            dq.popleft()
        
        if len(dq) > threshold:  # Strict ISA compliance
            # Record flood state
```

**Key Features**:
- **Strict Threshold**: Count > threshold (not ≥)
- **Precise Timing**: Exact 10-minute sliding windows
- **Merge Logic**: Adjacent flood periods combined
- **Peak Tracking**: Highest count windows identified

### 4.2 Health Metrics Calculation

**ISA Health Percentage**:
```
ISA Health % = 100 - (Flood Duration / Total Observation Time × 100)
```

**Compliance Assessment**:
- **Target**: <1% time in flood state
- **Measurement**: Actual percentage time in flood
- **Status**: Boolean compliance indicator

### 4.3 Plant-Wide Aggregation

**Multi-File Processing**:
1. **Timestamp Collection**: All CSV files read and timestamps extracted
2. **Temporal Sorting**: Plant-wide event timeline creation
3. **Flood Detection**: ISA algorithm applied to combined timeline
4. **Source Attribution**: Event details linked back to sources
5. **Aggregation**: Results summarized by location, condition, priority

## 5. Data Flow Architecture

### 5.1 End-to-End Data Flow

```
CSV Files → Smart Reader → Time Normalization → Flood Detection → API Response → UI Rendering
    ↓             ↓              ↓                 ↓              ↓           ↓
Raw Events → Parsed Data → UTC Timestamps → Flood Intervals → JSON → Interactive Charts
```

### 5.2 Processing Pipeline

**1. Data Ingestion**:
- CSV files automatically discovered in `PVCI_FOLDER`
- Header rows skipped (first 8 rows)
- Column mapping and validation
- Error handling for malformed data

**2. Time Processing**:
- Multiple datetime format support
- UTC normalization for consistency  
- Timezone-aware calculations
- Missing timestamp handling

**3. Flood Analysis**:
- Per-source individual analysis
- Plant-wide timeline aggregation
- ISA-18.2 compliant sliding windows
- Peak period identification

**4. Result Aggregation**:
- Multi-level summaries (plant → location → source)
- Statistical calculations (percentages, rates, counts)
- Pre-computed frontend aggregations
- Caching for performance

**5. API Serialization**:
- JSON response formatting
- Optional data inclusion (lite vs. full)
- Error state handling
- Cache headers and TTL

**6. Frontend Processing**:
- API response transformation
- UI state synchronization
- Chart data preparation
- Interactive event handling

## 6. Performance Optimizations

### 6.1 Backend Optimizations

**1. Pre-computed Aggregations**:
- Enhanced endpoints with 90%+ performance improvement
- Background processing for heavy calculations
- Smart caching with appropriate TTLs

**2. Efficient Data Processing**:
- Chunked CSV reading for large files
- Memory-efficient pandas operations
- Parallel processing with ThreadPoolExecutor
- LRU caching for expensive operations

**3. Database-Free Architecture**:
- Direct CSV processing (no database overhead)
- In-memory calculations
- File-based caching for results

### 6.2 Frontend Optimizations

**1. Query Caching**:
- TanStack Query with intelligent caching
- Multi-level cache (memory + localStorage)
- In-flight request deduplication

**2. Lazy Loading**:
- Component-level code splitting
- Progressive data loading
- Conditional rendering based on user interactions

**3. State Management**:
- Optimized re-render cycles
- Selective component updates
- Memoized calculations

## 7. User Interface Design

### 7.1 Mode Selection

**Plant-Wide (ISA 18.2) Mode Features**:
- Global time range picker
- System source filtering toggle
- Interactive window selection
- Compliance status indicators

**Visual Indicators**:
- Color-coded health status
- Progress bars for metrics
- Real-time loading states
- Error boundary handling

### 7.2 Interactive Components

**1. Time Range Selection**:
- Datetime picker with domain constraints
- Quick preset options (last 24h, week, month)
- Applied vs. input state management
- Validation with feedback

**2. Window Analysis**:
- Click-to-select flood windows
- Detailed source breakdown
- Time picker for custom windows
- Window validation (unhealthy check)

**3. Chart Interactions**:
- Hover tooltips with detailed information
- Click events for drilling down
- Zoom and pan capabilities
- Export functionality

## 8. Key Features and Capabilities

### 8.1 ISA 18.2 Compliance Features

**1. Sliding Window Analysis**:
- Precise 10-minute window calculations
- Strict threshold compliance (> not ≥)
- Peak window identification
- Merge logic for continuous floods

**2. Plant-Wide Metrics**:
- Overall health percentage
- Time in flood calculation
- Compliance assessment (<1% target)
- Daily breakdown analysis

**3. Source Analysis**:
- Individual source performance
- Location-based grouping
- Condition categorization
- Priority-weighted analysis

### 8.2 Advanced Analytics

**1. Trend Analysis**:
- Historical performance tracking
- Day-over-day comparisons
- Seasonal pattern identification
- Improvement measurement

**2. Root Cause Analysis**:
- Top contributing sources
- Location-based patterns
- Condition correlation analysis
- Time-based clustering

**3. Predictive Insights**:
- Flood probability scoring
- Maintenance recommendations
- Performance forecasting
- Alert threshold optimization

## 9. Configuration and Customization

### 9.1 Backend Configuration

**Environment Variables**:
```python
# Data paths
ALARM_DATA_DIR = "path/to/alarm/data"
PVCI_FOLDER = "PVC-I (Jan, Feb, Mar) EVENTS"

# Analysis parameters
DEFAULT_BIN_SIZE = "10min"
DEFAULT_THRESHOLD = 10
DEFAULT_WORKERS = 12
```

**Health Configuration**:
```python
config = HealthConfig(
    bin_size='10min',
    alarm_threshold=10,
    bins_per_day=144,
    skip_rows=8
)
```

### 9.2 Frontend Configuration

**API Configuration**:
```typescript
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
```

**Plant Mapping**:
```typescript
const PLANT_ID_MAP = {
  'PVC-I': 'pvcI',
  'PVC-II': 'pvcII',
  'PVC-III': 'pvcIII'
};
```

## 10. Monitoring and Troubleshooting

### 10.1 Logging and Diagnostics

**Backend Logging**:
- Structured logging with timestamps
- Error tracking with stack traces
- Performance metrics collection
- API request/response logging

**Frontend Error Handling**:
- Boundary components for error catching
- Fallback UI states
- User-friendly error messages
- Automatic retry mechanisms

### 10.2 Performance Monitoring

**Key Metrics**:
- API response times
- Cache hit rates
- Memory usage patterns
- Error occurrence rates

**Health Checks**:
- Data freshness validation
- API endpoint availability
- Cache coherence verification
- UI responsiveness testing

## 11. Security Considerations

### 11.1 Data Security

**Access Control**:
- Authentication required for dashboard access
- Plant-specific data isolation
- API rate limiting
- Input validation and sanitization

**Data Handling**:
- No sensitive data in client-side caches
- Secure HTTP headers
- Error message sanitization
- Audit trail logging

## 12. Scalability and Future Enhancements

### 12.1 Current Scalability Limits

**Data Volume**:
- CSV file size limitations
- Memory constraints for large datasets
- Processing time for complex analyses
- Frontend rendering performance

### 12.2 Potential Enhancements

**1. Real-Time Processing**:
- Stream processing for live data
- WebSocket connections for updates
- Event-driven architecture
- Continuous monitoring

**2. Advanced Analytics**:
- Machine learning integration
- Anomaly detection algorithms
- Predictive maintenance models
- Statistical process control

**3. Multi-Plant Support**:
- Cross-plant comparisons
- Centralized monitoring
- Role-based access control
- Hierarchical data organization

## 13. Conclusions

The PVCI Plant-Wide ISA 18.2 implementation represents a comprehensive alarm management solution that successfully combines:

1. **Technical Excellence**: Robust backend processing with efficient algorithms
2. **ISA Compliance**: Strict adherence to ISA-18.2 standards for plant-wide analysis
3. **User Experience**: Intuitive frontend with powerful visualization capabilities
4. **Performance**: Multi-level caching and optimization strategies
5. **Scalability**: Modular architecture supporting future enhancements

The system provides plant operators and engineers with the tools needed to:
- Monitor alarm system performance in real-time
- Identify problematic sources and patterns
- Ensure ISA-18.2 compliance
- Make data-driven optimization decisions
- Track improvement initiatives over time

This implementation serves as a solid foundation for advanced alarm management and can be extended to support additional plants, real-time monitoring, and predictive analytics capabilities.

---

*This report was generated based on comprehensive analysis of the codebase structure, implementation patterns, and architectural decisions. For technical questions or clarifications, please refer to the specific source files mentioned throughout the report.*