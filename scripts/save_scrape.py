#!/usr/bin/env python3
"""Save scrape results — only updates sections that have data, preserves existing values."""
import json, sys
from datetime import datetime, timezone

date = sys.argv[1]
raw = json.loads(sys.argv[2])

with open('config/personal/market_prices.json') as f:
    prices = json.load(f)

existing = prices.get(date, {})
old_sections = existing.get('sections', {})
old_high = existing.get('sectionsHigh', {})
old_counts = existing.get('sectionListingCounts', {})

# Merge: only overwrite if new value is not null
new_sections = {**old_sections}
new_high = {**old_high}
new_counts = {**old_counts}
for sec, data in raw['sections'].items():
    if data['low'] is not None:
        new_sections[sec] = data['low']
    if data['high'] is not None:
        new_high[sec] = data['high']
    new_counts[sec] = data['count']

new_data = {
    'fetchedAt': datetime.now(timezone.utc).isoformat(),
    'lowestOverall': raw['overallLow'],
    'medianPrice': raw['median'],
    'totalListings': raw['totalListings'],
    'sections': new_sections,
    'sectionsHigh': new_high,
    'sectionListingCounts': new_counts,
}
if existing.get('sections'):
    new_data['previousSections'] = existing['sections']
    new_data['previousFetchedAt'] = existing.get('fetchedAt')
if existing.get('sectionsHigh'):
    new_data['previousSectionsHigh'] = existing['sectionsHigh']
for key in ('primarySection', 'comparisonSections'):
    if existing.get(key):
        new_data[key] = existing[key]

prices[date] = {**existing, **new_data}
with open('config/personal/market_prices.json', 'w') as f:
    json.dump(prices, f, indent=2)
print(f'OK {date} | {raw["totalListings"]} listings')
