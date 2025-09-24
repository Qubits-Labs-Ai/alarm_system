import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, Typography, Box, Tabs, Tab, Chip, LinearProgress, Alert, Button, Accordion, AccordionSummary, AccordionDetails } from '@mui/material';
import { TrendingUp, Warning, CheckCircle, ExpandMore, Analytics } from '@mui/icons-material';

const AlarmInsightsPanel = ({ chartData, sourceId }) => {
  const [insights, setInsights] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(0);

  const generateInsights = async () => {
    setLoading(true);
    try {
      // Call your backend API to generate insights
      const response = await fetch('/api/generate-insights', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          data: chartData,
          selectedSource: sourceId 
        })
      });
      const insightsData = await response.json();
      setInsights(insightsData);
    } catch (error) {
      console.error('Error generating insights:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status) => {
    switch(status) {
      case 'EXCELLENT':
      case 'GOOD':
        return <CheckCircle color="success" />;
      case 'NEEDS IMPROVEMENT':
        return <Warning color="warning" />;
      case 'CRITICAL':
        return <Warning color="error" />;
      default:
        return <Analytics />;
    }
  };

  const renderSummary = () => {
    if (!insights?.summary?.executive_summary) return null;
    const summary = insights.summary.executive_summary;
    
    return (
      <Box>
        <Alert 
          severity={summary.status === 'CRITICAL' ? 'error' : 
                   summary.status === 'NEEDS IMPROVEMENT' ? 'warning' : 
                   'success'}
          icon={getStatusIcon(summary.status)}
        >
          <Typography variant="h6">{summary.headline}</Typography>
        </Alert>
        
        <Box mt={2}>
          <Typography variant="subtitle1" gutterBottom>Key Findings:</Typography>
          {summary.key_findings.map((finding, idx) => (
            <Chip 
              key={idx} 
              label={finding} 
              variant="outlined" 
              size="small" 
              sx={{ m: 0.5 }}
            />
          ))}
        </Box>

        {summary.immediate_actions.length > 0 && (
          <Box mt={2}>
            <Typography variant="subtitle1" gutterBottom>Immediate Actions Required:</Typography>
            <ul>
              {summary.immediate_actions.map((action, idx) => (
                <li key={idx}><Typography variant="body2">{action}</Typography></li>
              ))}
            </ul>
          </Box>
        )}
      </Box>
    );
  };

  const renderDescriptiveAnalysis = () => {
    if (!insights?.descriptive_analysis) return null;
    const analysis = insights.descriptive_analysis;
    
    return (
      <Box>
        {Object.entries(analysis).map(([key, section]) => (
          <Accordion key={key} defaultExpanded={key === 'system_overview'}>
            <AccordionSummary expandIcon={<ExpandMore />}>
              <Typography variant="h6">{section.title}</Typography>
            </AccordionSummary>
            <AccordionDetails>
              <Typography variant="body2" paragraph>
                {section.description}
              </Typography>
              {section.details && (
                <Box>
                  {Object.entries(section.details).map(([detailKey, value]) => (
                    <Box key={detailKey} display="flex" justifyContent="space-between" mb={1}>
                      <Typography variant="body2" color="textSecondary">
                        {detailKey.replace(/_/g, ' ').toUpperCase()}:
                      </Typography>
                      <Typography variant="body2" fontWeight="bold">
                        {value}
                      </Typography>
                    </Box>
                  ))}
                </Box>
              )}
              {section.findings && (
                <Box mt={2}>
                  <pre style={{ 
                    backgroundColor: '#f5f5f5', 
                    padding: '10px', 
                    borderRadius: '4px',
                    fontSize: '12px'
                  }}>
                    {JSON.stringify(section.findings, null, 2)}
                  </pre>
                </Box>
              )}
            </AccordionDetails>
          </Accordion>
        ))}
      </Box>
    );
  };

  const renderPrescriptiveAnalysis = () => {
    if (!insights?.prescriptive_analysis) return null;
    const analysis = insights.prescriptive_analysis;
    
    return (
      <Box>
        {analysis.overall_strategy && (
          <Card variant="outlined" sx={{ mb: 2 }}>
            <CardHeader title={analysis.overall_strategy.title} />
            <CardContent>
              <Typography variant="body2" paragraph>
                {analysis.overall_strategy.description}
              </Typography>
              <Box mt={2}>
                {analysis.overall_strategy.phases.map((phase) => (
                  <Box key={phase.phase} mb={2}>
                    <Typography variant="subtitle2" color="primary">
                      Phase {phase.phase}: {phase.name}
                    </Typography>
                    <Typography variant="body2" color="textSecondary">
                      Duration: {phase.duration}
                    </Typography>
                    <Typography variant="body2">
                      {phase.focus}
                    </Typography>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        )}

        {analysis.prioritized_recommendations && (
          <Box>
            <Typography variant="h6" gutterBottom>Prioritized Recommendations</Typography>
            {Object.entries(analysis.prioritized_recommendations).map(([priority, items]) => (
              items.length > 0 && (
                <Accordion key={priority}>
                  <AccordionSummary expandIcon={<ExpandMore />}>
                    <Chip 
                      label={`${priority.toUpperCase()} PRIORITY`} 
                      color={priority === 'critical' ? 'error' : 
                             priority === 'high' ? 'warning' : 
                             priority === 'medium' ? 'primary' : 'default'}
                      size="small"
                    />
                    <Typography sx={{ ml: 2 }}>
                      {items.length} Recommendation{items.length > 1 ? 's' : ''}
                    </Typography>
                  </AccordionSummary>
                  <AccordionDetails>
                    {items.map((item, idx) => (
                      <Card key={idx} variant="outlined" sx={{ mb: 1 }}>
                        <CardContent>
                          <Typography variant="subtitle2" color="primary">
                            {item.recommendation}
                          </Typography>
                          <Typography variant="body2" paragraph>
                            {item.action}
                          </Typography>
                          <Box display="flex" gap={2}>
                            <Chip label={`Impact: ${item.expected_impact}`} size="small" />
                            <Chip label={`Time: ${item.implementation_time}`} size="small" />
                          </Box>
                        </CardContent>
                      </Card>
                    ))}
                  </AccordionDetails>
                </Accordion>
              )
            ))}
          </Box>
        )}
      </Box>
    );
  };

  return (
    <Card>
      <CardHeader 
        title="AI Insights Analysis"
        action={
          <Button 
            variant="contained" 
            startIcon={<Analytics />}
            onClick={generateInsights}
            disabled={loading}
          >
            {loading ? 'Analyzing...' : 'Generate Insights'}
          </Button>
        }
      />
      <CardContent>
        {loading && <LinearProgress />}
        
        {insights && (
          <Box>
            <Tabs value={activeTab} onChange={(e, v) => setActiveTab(v)}>
              <Tab label="Summary" />
              <Tab label="Descriptive Analysis" />
              <Tab label="Prescriptive Analysis" />
              <Tab label="Key Metrics" />
            </Tabs>
            
            <Box mt={2}>
              {activeTab === 0 && renderSummary()}
              {activeTab === 1 && renderDescriptiveAnalysis()}
              {activeTab === 2 && renderPrescriptiveAnalysis()}
              {activeTab === 3 && (
                <Box>
                  {insights.key_metrics && Object.entries(insights.key_metrics).map(([key, value]) => (
                    <Box key={key} display="flex" justifyContent="space-between" mb={1}>
                      <Typography>{key.replace(/_/g, ' ').toUpperCase()}:</Typography>
                      <Typography fontWeight="bold">{value}</Typography>
                    </Box>
                  ))}
                </Box>
              )}
            </Box>
          </Box>
        )}
      </CardContent>
    </Card>
  );
};

export default AlarmInsightsPanel;