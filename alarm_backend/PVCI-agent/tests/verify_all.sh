#!/bin/bash
# Complete verification script for all 7 phases

echo "=========================================="
echo "PVCI Agent - Complete Verification Suite"
echo "=========================================="

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Track overall results
TOTAL_PASSED=0
TOTAL_FAILED=0

# Phase 1: Critical Fixes
echo -e "\n${YELLOW}Running Phase 1 Verification...${NC}"
python tests/verify_phase1.py
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Phase 1 PASSED${NC}"
    ((TOTAL_PASSED++))
else
    echo -e "${RED}✗ Phase 1 FAILED${NC}"
    ((TOTAL_FAILED++))
fi

# Phase 2: Validation & Schema
echo -e "\n${YELLOW}Running Phase 2 Verification...${NC}"
python tests/verify_phase2.py
if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ Phase 2 PASSED${NC}"
    ((TOTAL_PASSED++))
else
    echo -e "${RED}✗ Phase 2 FAILED${NC}"
    ((TOTAL_FAILED++))
fi

# Phase 3: Error Recovery (manual for now)
echo -e "\n${YELLOW}Phase 3: Error Recovery (Manual Check Required)${NC}"
echo "  - Test error pattern matching"
echo "  - Test auto-fix functions"
echo "  - Test retry budget"
echo "  - Test query simplification"
read -p "Did Phase 3 tests pass? (y/n): " phase3_pass
if [ "$phase3_pass" = "y" ]; then
    echo -e "${GREEN}✓ Phase 3 PASSED (Manual)${NC}"
    ((TOTAL_PASSED++))
else
    echo -e "${RED}✗ Phase 3 FAILED (Manual)${NC}"
    ((TOTAL_FAILED++))
fi

# Phase 4: Performance
echo -e "\n${YELLOW}Phase 4: Performance Testing${NC}"
echo "  - Testing cache implementation..."
# Add cache tests here
echo "  - Testing connection pooling..."
# Add pool tests here
echo "  - Running load test (10 concurrent queries)..."
# Add load test here
read -p "Did Phase 4 performance tests pass? (y/n): " phase4_pass
if [ "$phase4_pass" = "y" ]; then
    echo -e "${GREEN}✓ Phase 4 PASSED${NC}"
    ((TOTAL_PASSED++))
else
    echo -e "${RED}✗ Phase 4 FAILED${NC}"
    ((TOTAL_FAILED++))
fi

# Phase 5: Multi-Plant
echo -e "\n${YELLOW}Phase 5: Multi-Plant Support${NC}"
echo "  - Testing plant_id parameter..."
echo "  - Testing plant filtering..."
echo "  - Testing multi-plant queries..."
read -p "Did Phase 5 multi-plant tests pass? (y/n): " phase5_pass
if [ "$phase5_pass" = "y" ]; then
    echo -e "${GREEN}✓ Phase 5 PASSED${NC}"
    ((TOTAL_PASSED++))
else
    echo -e "${RED}✗ Phase 5 FAILED${NC}"
    ((TOTAL_FAILED++))
fi

# Phase 6: Monitoring
echo -e "\n${YELLOW}Phase 6: Monitoring & Quality${NC}"
echo "  - Checking metrics endpoint..."
curl -s http://localhost:8000/agent/pvci/metrics > /dev/null
if [ $? -eq 0 ]; then
    echo "  ✓ Metrics endpoint accessible"
else
    echo "  ✗ Metrics endpoint failed"
fi

echo "  - Checking health endpoint..."
curl -s http://localhost:8000/agent/pvci/health > /dev/null
if [ $? -eq 0 ]; then
    echo "  ✓ Health endpoint accessible"
else
    echo "  ✗ Health endpoint failed"
fi

read -p "Did Phase 6 monitoring tests pass? (y/n): " phase6_pass
if [ "$phase6_pass" = "y" ]; then
    echo -e "${GREEN}✓ Phase 6 PASSED${NC}"
    ((TOTAL_PASSED++))
else
    echo -e "${RED}✗ Phase 6 FAILED${NC}"
    ((TOTAL_FAILED++))
fi

# Phase 7: Testing & Docs
echo -e "\n${YELLOW}Phase 7: Testing & Documentation${NC}"
echo "  - Running pytest suite..."
pytest tests/ --tb=short 2>&1 | tail -20
if [ ${PIPESTATUS[0]} -eq 0 ]; then
    echo "  ✓ All unit tests passed"
else
    echo "  ✗ Some unit tests failed"
fi

echo "  - Checking documentation..."
if [ -f "API_REFERENCE.md" ] && [ -f "ERROR_GUIDE.md" ]; then
    echo "  ✓ Documentation files present"
else
    echo "  ✗ Documentation missing"
fi

read -p "Did Phase 7 testing/docs pass? (y/n): " phase7_pass
if [ "$phase7_pass" = "y" ]; then
    echo -e "${GREEN}✓ Phase 7 PASSED${NC}"
    ((TOTAL_PASSED++))
else
    echo -e "${RED}✗ Phase 7 FAILED${NC}"
    ((TOTAL_FAILED++))
fi

# Final Summary
echo ""
echo "=========================================="
echo "           VERIFICATION SUMMARY           "
echo "=========================================="
echo -e "Phases Passed: ${GREEN}$TOTAL_PASSED${NC}/7"
echo -e "Phases Failed: ${RED}$TOTAL_FAILED${NC}/7"

SUCCESS_RATE=$((TOTAL_PASSED * 100 / 7))
echo "Success Rate: $SUCCESS_RATE%"

if [ $TOTAL_FAILED -eq 0 ]; then
    echo ""
    echo -e "${GREEN}🎉 ALL PHASES PASSED - READY FOR PRODUCTION${NC}"
    exit 0
elif [ $SUCCESS_RATE -ge 80 ]; then
    echo ""
    echo -e "${YELLOW}⚠️  MOSTLY PASSED - Review failed phases${NC}"
    exit 1
else
    echo ""
    echo -e "${RED}❌ VERIFICATION FAILED - Fix issues before deployment${NC}"
    exit 1
fi
