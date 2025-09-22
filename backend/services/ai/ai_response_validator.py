"""
AI Response Validator Service
Ensures all AI responses meet military-style factual requirements
"""

import re
import logging
from typing import Dict, List, Any, Optional, Tuple
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)

class ValidationSeverity(Enum):
    """Validation issue severity levels"""
    CRITICAL = "critical"      # Must be fixed - contains predictions/speculation
    WARNING = "warning"        # Should be improved - style issues
    INFO = "info"             # Minor improvements possible

@dataclass
class ValidationIssue:
    """Represents a validation issue found in AI response"""
    severity: ValidationSeverity
    category: str
    description: str
    found_text: str
    suggestion: str
    location: Optional[int] = None

@dataclass
class ValidationResult:
    """Result of AI response validation"""
    passes_validation: bool
    overall_score: float  # 0.0 to 1.0
    issues: List[ValidationIssue]
    metrics: Dict[str, Any]
    cleaned_response: Optional[str] = None

class MilitaryResponseValidator:
    """Validates AI responses against military-style factual requirements"""
    
    # Critical violations - responses containing these fail validation
    PREDICTION_PATTERNS = [
        r'\b(will\s+(?:be|go|rise|fall|increase|decrease|happen))\b',
        r'\b(going\s+to\s+(?:be|go|rise|fall|increase|decrease))\b',
        r'\b(expect\s+(?:to|that|it))\b',
        r'\b(forecast[s]?|predict[s]?|anticipate[s]?)\b',
        r'\b(likely\s+to\s+(?:be|go|rise|fall|increase|decrease))\b',
        r'\b(probably\s+(?:will|going))\b',
        r'\bnext\s+(?:week|month|quarter|year)\s+(?:will|should)\b',
        r'\bin\s+the\s+future\b',
        r'\bupcoming\s+(?:trend|movement)\b'
    ]
    
    SPECULATION_PATTERNS = [
        r'\b(might|could|may|possibly|perhaps)\b',
        r'\b(seems?\s+(?:to|like|that))\b',
        r'\b(appears?\s+(?:to|that))\b',
        r'\b(suggests?\s+(?:that|it))\b',
        r'\b(indicates?\s+(?:that|it))\b',
        r'\b(I\s+think|I\s+believe|in\s+my\s+opinion)\b',
        r'\b(it\'s\s+possible\s+that)\b',
        r'\b(chances\s+are)\b',
        r'\b(odds\s+are)\b'
    ]
    
    UNCERTAIN_LANGUAGE = [
        r'\b(kind\s+of|sort\s+of|somewhat|rather)\b',
        r'\b(approximately|roughly|around|about)\s+\$?[\d,]+(?:\.\d+)?\s*(?:\%|percent)?\b',
        r'\b(generally|typically|usually|often)\b',
        r'\b(tend\s+to|tends\s+to)\b'
    ]
    
    # Required elements for military-style responses
    REQUIRED_ELEMENTS = [
        r'(?:DATA|ANALYSIS|STATUS|ASSESSMENT|METRICS)',  # Military headers
        r'\$[\d,]+(?:\.\d{2})?',  # Specific dollar amounts
        r'\d+(?:\.\d+)?\%',       # Specific percentages
        r'\b\d+\s+(?:trades?|positions?|days?)\b'  # Specific counts
    ]
    
    def __init__(self):
        """Initialize the military response validator"""
        self.validation_enabled = True
        logger.info("Military Response Validator initialized")
    
    def validate_response(self, response: str, response_type: str = "general") -> ValidationResult:
        """
        Validate AI response against military-style requirements
        
        Args:
            response: AI response text to validate
            response_type: Type of response (chat, report, analysis)
            
        Returns:
            ValidationResult with pass/fail status and detailed feedback
        """
        if not self.validation_enabled:
            return ValidationResult(
                passes_validation=True,
                overall_score=1.0,
                issues=[],
                metrics={},
                cleaned_response=response
            )
        
        issues = []
        metrics = {
            "word_count": len(response.split()),
            "character_count": len(response),
            "line_count": len(response.split('\n')),
            "response_type": response_type
        }
        
        # Check for critical violations
        issues.extend(self._check_predictions(response))
        issues.extend(self._check_speculation(response))
        
        # Check for style issues
        issues.extend(self._check_uncertain_language(response))
        issues.extend(self._check_required_elements(response))
        issues.extend(self._check_verbosity(response))
        issues.extend(self._check_structure(response, response_type))
        
        # Calculate scores
        critical_issues = [i for i in issues if i.severity == ValidationSeverity.CRITICAL]
        warning_issues = [i for i in issues if i.severity == ValidationSeverity.WARNING]
        
        # Fail if any critical issues
        passes_validation = len(critical_issues) == 0
        
        # Calculate overall score
        score = 1.0
        score -= len(critical_issues) * 0.5  # Critical issues heavily penalized
        score -= len(warning_issues) * 0.1   # Warning issues lightly penalized
        score = max(0.0, score)
        
        # Metrics
        metrics.update({
            "critical_issues": len(critical_issues),
            "warning_issues": len(warning_issues),
            "total_issues": len(issues),
            "prediction_violations": len([i for i in critical_issues if "prediction" in i.category.lower()]),
            "speculation_violations": len([i for i in critical_issues if "speculation" in i.category.lower()])
        })
        
        # Clean response if possible
        cleaned_response = self._clean_response(response) if not passes_validation else response
        
        return ValidationResult(
            passes_validation=passes_validation,
            overall_score=score,
            issues=issues,
            metrics=metrics,
            cleaned_response=cleaned_response
        )
    
    def _check_predictions(self, response: str) -> List[ValidationIssue]:
        """Check for prediction language (critical violation)"""
        issues = []
        
        for pattern in self.PREDICTION_PATTERNS:
            matches = re.finditer(pattern, response, re.IGNORECASE)
            for match in matches:
                issues.append(ValidationIssue(
                    severity=ValidationSeverity.CRITICAL,
                    category="Prediction Violation",
                    description="Contains prediction language - military AI provides facts only",
                    found_text=match.group(),
                    suggestion="Replace with factual statement or remove",
                    location=match.start()
                ))
        
        return issues
    
    def _check_speculation(self, response: str) -> List[ValidationIssue]:
        """Check for speculation language (critical violation)"""
        issues = []
        
        for pattern in self.SPECULATION_PATTERNS:
            matches = re.finditer(pattern, response, re.IGNORECASE)
            for match in matches:
                issues.append(ValidationIssue(
                    severity=ValidationSeverity.CRITICAL,
                    category="Speculation Violation",
                    description="Contains speculation language - state facts only",
                    found_text=match.group(),
                    suggestion="Replace with factual observation or remove",
                    location=match.start()
                ))
        
        return issues
    
    def _check_uncertain_language(self, response: str) -> List[ValidationIssue]:
        """Check for uncertain/vague language (warning)"""
        issues = []
        
        for pattern in self.UNCERTAIN_LANGUAGE:
            matches = re.finditer(pattern, response, re.IGNORECASE)
            for match in matches:
                issues.append(ValidationIssue(
                    severity=ValidationSeverity.WARNING,
                    category="Uncertain Language",
                    description="Contains vague language - be more precise",
                    found_text=match.group(),
                    suggestion="Use specific numbers or remove qualifier",
                    location=match.start()
                ))
        
        return issues
    
    def _check_required_elements(self, response: str) -> List[ValidationIssue]:
        """Check for required military-style elements"""
        issues = []
        
        # Check for military-style headers
        has_headers = bool(re.search(self.REQUIRED_ELEMENTS[0], response, re.IGNORECASE))
        if not has_headers:
            issues.append(ValidationIssue(
                severity=ValidationSeverity.WARNING,
                category="Structure",
                description="Missing military-style headers (DATA, ANALYSIS, STATUS, etc.)",
                found_text="",
                suggestion="Add structured headers like 'DATA ANALYSIS:' or 'CURRENT STATUS:'"
            ))
        
        # Check for specific quantified data
        has_amounts = bool(re.search(self.REQUIRED_ELEMENTS[1], response))
        has_percentages = bool(re.search(self.REQUIRED_ELEMENTS[2], response))
        has_counts = bool(re.search(self.REQUIRED_ELEMENTS[3], response))
        
        if not (has_amounts or has_percentages or has_counts):
            issues.append(ValidationIssue(
                severity=ValidationSeverity.WARNING,
                category="Quantification",
                description="Missing specific quantified data",
                found_text="",
                suggestion="Include specific dollar amounts, percentages, or trade counts"
            ))
        
        return issues
    
    def _check_verbosity(self, response: str) -> List[ValidationIssue]:
        """Check response length (military responses should be concise)"""
        issues = []
        
        word_count = len(response.split())
        
        if word_count > 300:
            issues.append(ValidationIssue(
                severity=ValidationSeverity.WARNING,
                category="Verbosity",
                description=f"Response too verbose ({word_count} words) - military style should be concise",
                found_text="",
                suggestion="Reduce to under 200 words, focus on essential facts only"
            ))
        
        return issues
    
    def _check_structure(self, response: str, response_type: str) -> List[ValidationIssue]:
        """Check response structure for military formatting"""
        issues = []
        
        # Check for proper sectioning
        if response_type in ["report", "analysis"]:
            sections = re.findall(r'^[A-Z\s]+:?\s*$', response, re.MULTILINE)
            if len(sections) < 2:
                issues.append(ValidationIssue(
                    severity=ValidationSeverity.WARNING,
                    category="Structure",
                    description="Report lacks proper sectioning",
                    found_text="",
                    suggestion="Use clear section headers in ALL CAPS"
                ))
        
        return issues
    
    def _clean_response(self, response: str) -> str:
        """Attempt to clean response by removing problematic language"""
        cleaned = response
        
        # Remove prediction language
        for pattern in self.PREDICTION_PATTERNS:
            cleaned = re.sub(pattern, "[FACTUAL ANALYSIS ONLY]", cleaned, flags=re.IGNORECASE)
        
        # Remove speculation language
        for pattern in self.SPECULATION_PATTERNS:
            cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE)
        
        # Clean up multiple spaces and empty lines
        cleaned = re.sub(r'\s+', ' ', cleaned)
        cleaned = re.sub(r'\n\s*\n', '\n\n', cleaned)
        
        return cleaned.strip()
    
    def generate_validation_report(self, result: ValidationResult) -> str:
        """Generate human-readable validation report"""
        report = f"""
VALIDATION REPORT
=================
Status: {'PASS' if result.passes_validation else 'FAIL'}
Overall Score: {result.overall_score:.2f}/1.00
Response Type: {result.metrics.get('response_type', 'unknown')}

METRICS:
- Word Count: {result.metrics.get('word_count', 0)}
- Critical Issues: {result.metrics.get('critical_issues', 0)}
- Warning Issues: {result.metrics.get('warning_issues', 0)}
- Prediction Violations: {result.metrics.get('prediction_violations', 0)}
- Speculation Violations: {result.metrics.get('speculation_violations', 0)}

"""
        
        if result.issues:
            report += "ISSUES FOUND:\n"
            for i, issue in enumerate(result.issues, 1):
                report += f"{i}. [{issue.severity.value.upper()}] {issue.category}\n"
                report += f"   Description: {issue.description}\n"
                if issue.found_text:
                    report += f"   Found: '{issue.found_text}'\n"
                report += f"   Suggestion: {issue.suggestion}\n\n"
        else:
            report += "No issues found - response meets military-style requirements.\n"
        
        return report
    
    def enable_validation(self, enabled: bool = True):
        """Enable or disable validation"""
        self.validation_enabled = enabled
        logger.info(f"Military response validation {'enabled' if enabled else 'disabled'}")
    
    def get_validation_stats(self) -> Dict[str, Any]:
        """Get validation statistics"""
        return {
            "validation_enabled": self.validation_enabled,
            "prediction_patterns_count": len(self.PREDICTION_PATTERNS),
            "speculation_patterns_count": len(self.SPECULATION_PATTERNS),
            "uncertain_language_patterns_count": len(self.UNCERTAIN_LANGUAGE),
            "required_elements_count": len(self.REQUIRED_ELEMENTS)
        }

# Global validator instance
military_validator = MilitaryResponseValidator()
