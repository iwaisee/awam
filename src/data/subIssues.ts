import type { CategoryRule } from "@/types/civic";

/* Detailed sub-issue catalog — the step after category selection. Modeled on
   the Suthra Punjab complaint taxonomy (suthra.punjab.gov.pk): the citizen
   picks the broad department first, then the specific issue from a grid.

   A CategoryRule's admin-managed `tags` take precedence when non-empty, so
   the console can tailor the menu per city; this catalog is the built-in
   default. Every entry carries its Urdu inline, exactly like the reference
   site renders them. */

export const SUB_ISSUES: Record<string, string[]> = {
  sanitation: [
    "Non Collection of Waste (کچرے کی عدم وصولی)",
    "Heaps of Garbage (کچرے کے ڈھیر)",
    "Manual Sweeping — Residential (گلیوں کی صفائی)",
    "Manual Sweeping — Commercial (کمرشل ایریا کی صفائی)",
    "Container Not Serviced (کنٹینر صفائی نہیں)",
    "Container Not Available (کنٹینر موجود نہیں)",
    "New Container Placement Request (نیا کنٹینر لگوانے کی درخواست)",
    "Waste Bin Required (کچرے کا ڈبہ درکار)",
    "Waste Burned (کچرا جلایا گیا)",
    "Open Plot Waste (کھلے پلاٹ میں کچرا)",
    "Desilting of Open Drains (نالوں کی صفائی)",
    "Dead Animal Removal (مرنے والے جانور کی ہٹائی)",
    "Animal Waste Disposal (جانوروں کے فضلے کا انتظام)",
    "Construction & Demolition Waste (تعمیراتی ملبہ)",
    "Washing & Sprinkling Request (صفائی و پاشیدگی کی درخواست)",
  ],
  broken_road: [
    "Potholes (سوراخ دار سڑک)",
    "Road Surface Collapse (سڑک بیٹھ جانا)",
    "Damaged Footpath (توٹا ہوا فٹ پاتھ)",
    "Unrestored Road Digging (بند نہ ہوئی کھدائی)",
    "Broken Road Edge / Shoulder (ٹوٹا ہوا کنارہ)",
    "Debris on Carriageway (سڑک پر ملبہ)",
  ],
  open_manhole: [
    "Open / Missing Manhole Cover (کھلا یا غائب منہول)",
    "Broken Drain Slab (ٹوٹی ہوئی سلاب)",
    "Choked Stormwater Drain (بند نالی)",
    "Sewer Overflow (سیوری اوور فلو)",
    "Foul Smell & Septic Overflow (بدبو اور گندگی)",
    "Drain Water on Road (سڑک پر نالے کا پانی)",
  ],
  water_leak: [
    "Burst Supply Line (پھٹی ہوئی لائن)",
    "Continuous Leakage (مسلسل رساؤ)",
    "Contaminated / Dirty Water (گندا پانی)",
    "Low or No Pressure (پریشر کی کمی)",
    "Broken Valve / Hydrant (ٹوٹا ہوا والو)",
    "Waterlogging on Street (گلی میں جمع پانی)",
  ],
  electricity: [
    "Loose / Hanging Wires (لٹکتے ہوئے تاریں)",
    "Sparking Transformer (سپارکنگ ٹرانسفارمر)",
    "Leaning / Broken Pole (جھکا یا ٹوٹا کھنبا)",
    "Cable Hazard at Ground Level (زمین پر کیبل خطرہ)",
    "Blackout / Line Fault (بجلی کا بلیک آؤٹ)",
    "Transformer Oil Leak (ٹرانسفارمر آئل لیک)",
  ],
  traffic: [
    "Broken Traffic Signal (خراب ٹریفک سگنل)",
    "Signal Timing Fault (سگنل ٹائمنگ کی خرابی)",
    "Encroachment Choke Point (تجاوزات)",
    "Missing Signage / Markings (غائب بورڈز اور لکیریں)",
    "Illegal Parking Bottleneck (غیر قانونی پارکنگ)",
    "Damaged Road Divider (ٹوٹا ہوا ڈیوائیڈر)",
  ],
  streetlight: [
    "Dead Lamp (خراب بلب)",
    "Flickering Light (جھلملاتی روشنی)",
    "Light On All Day (ٹائمر کی خرابی)",
    "Leaning / Broken Pole (جھکا ہوا کھنبا)",
    "New Light Required (نئی لائٹ کی درخواست)",
    "Dark Stretch (اندھیرا ہوا حصہ)",
  ],
  cantonment_infrastructure: [
    "Road / Footpath Damage (سڑک اور فٹ پاتھ)",
    "Sanitation Issue (صفائی)",
    "Water Supply Issue (پانی کا مسئلہ)",
    "Streetlight Issue (اسٹریٹ لائٹ)",
    "Sewerage / Drain Issue (سیوریج اور نالیاں)",
    "Other Infrastructure (دیگر بلدیاتی مسائل)",
  ],
  dengue: [
    "Standing Water Hotspot (جمے ہوئے پانی کا ٹھکانا)",
    "Larvae Sightings (لاروا کی موجودگی)",
    "Fogging Request (فیومنگ کی درخواست)",
    "Abandoned Tyres / Containers (چھوڑے ہوئے ٹائر)",
    "Overgrown Nullah Vegetation (نالے کی بڑھی گھاس)",
  ],
};

/** Fallback for admin-added categories the catalog does not know. */
const GENERIC_SUB_ISSUES = [
  "General Complaint (عمومی شکایت)",
  "Other (دیگر)",
];

/** The menu for one category: admin-managed tags win, the built-in catalog
    is the default, and unknown categories still get a usable generic list. */
export function subIssuesFor(rule: CategoryRule): string[] {
  if (rule.tags.length > 0) return rule.tags;
  return SUB_ISSUES[rule.id] ?? GENERIC_SUB_ISSUES;
}
