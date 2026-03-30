#!/usr/bin/env python3
"""
MetaTrader 5 Python Documentation Scraper
==========================================
Uses Microsoft Edge WebDriver in VISIBLE (non-headless) mode to scrape:
  https://www.mql5.com/en/docs/python_metatrader5

Output: metatrader5_python_docs.md

Requirements:
    pip install selenium beautifulsoup4

    1. Install Microsoft Edge (if not already installed)
    2. Download msedgedriver that matches your Edge version from:
       https://developer.microsoft.com/en-us/microsoft-edge/tools/webdriver/
    3. Place msedgedriver.exe on your PATH  (or set EDGEDRIVER_PATH below)
"""

import re
import time

from bs4 import BeautifulSoup
from selenium import webdriver
from selenium.webdriver.edge.options import Options as EdgeOptions
from selenium.webdriver.edge.service import Service as EdgeService
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# ──────────────────────────────────────────────────────────────────────────────
# CONFIG  —  edit these if needed
# ──────────────────────────────────────────────────────────────────────────────

# Full path to msedgedriver.exe — set to None if it is on your PATH
EDGEDRIVER_PATH = "./msedgedriver.exe"

OUTPUT_FILE          = "metatrader5_python_docs.md"
PAGE_LOAD_TIMEOUT    = 30       # seconds
DELAY_BETWEEN_PAGES  = 2.0      # seconds — be polite to the server

# ──────────────────────────────────────────────────────────────────────────────

BASE_URL  = "https://www.mql5.com"
INDEX_URL = f"{BASE_URL}/en/docs/python_metatrader5"

TOPICS = [
    ("initialize",           "mt5initialize_py"),
    ("login",                "mt5login_py"),
    ("shutdown",             "mt5shutdown_py"),
    ("version",              "mt5version_py"),
    ("last_error",           "mt5lasterror_py"),
    ("account_info",         "mt5accountinfo_py"),
    ("terminal_info",        "mt5terminalinfo_py"),
    ("symbols_total",        "mt5symbolstotal_py"),
    ("symbols_get",          "mt5symbolsget_py"),
    ("symbol_info",          "mt5symbolinfo_py"),
    ("symbol_info_tick",     "mt5symbolinfotick_py"),
    ("symbol_select",        "mt5symbolselect_py"),
    ("market_book_add",      "mt5marketbookadd_py"),
    ("market_book_get",      "mt5marketbookget_py"),
    ("market_book_release",  "mt5marketbookrelease_py"),
    ("copy_rates_from",      "mt5copyratesfrom_py"),
    ("copy_rates_from_pos",  "mt5copyratesfrompos_py"),
    ("copy_rates_range",     "mt5copyratesrange_py"),
    ("copy_ticks_from",      "mt5copyticksfrom_py"),
    ("copy_ticks_range",     "mt5copyticksrange_py"),
    ("orders_total",         "mt5orderstotal_py"),
    ("orders_get",           "mt5ordersget_py"),
    ("order_calc_margin",    "mt5ordercalcmargin_py"),
    ("order_calc_profit",    "mt5ordercalcprofit_py"),
    ("order_check",          "mt5ordercheck_py"),
    ("order_send",           "mt5ordersend_py"),
    ("positions_total",      "mt5positionstotal_py"),
    ("positions_get",        "mt5positionsget_py"),
    ("history_orders_total", "mt5historyorderstotal_py"),
    ("history_orders_get",   "mt5historyordersget_py"),
    ("history_deals_total",  "mt5historydealstotal_py"),
    ("history_deals_get",    "mt5historydealsget_py"),
]


# ══════════════════════════════════════════════════════════════════════════════
# BROWSER
# ══════════════════════════════════════════════════════════════════════════════

def create_driver() -> webdriver.Edge:
    """Launch a real, visible Edge window with bot-detection mitigations."""

    options = EdgeOptions()

    # ── Visible window — headless is intentionally OFF ───────────────────────
    # options.add_argument("--headless")    <-- NOT set

    options.add_argument("--start-maximized")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--log-level=3")

    # Remove "Edge is being controlled by automated software" banner
    options.add_experimental_option("excludeSwitches", ["enable-automation"])
    options.add_experimental_option("useAutomationExtension", False)

    service = EdgeService(executable_path=EDGEDRIVER_PATH) if EDGEDRIVER_PATH \
              else EdgeService()

    driver = webdriver.Edge(service=service, options=options)

    # Patch out navigator.webdriver so JS bot-checks return undefined
    driver.execute_cdp_cmd(
        "Page.addScriptToEvaluateOnNewDocument",
        {"source": "Object.defineProperty(navigator,'webdriver',{get:()=>undefined})"}
    )

    driver.set_page_load_timeout(PAGE_LOAD_TIMEOUT)
    return driver


def fetch_html(driver: webdriver.Edge, url: str) -> str:
    """
    Navigate to *url* in the open Edge window, wait for the documentation
    content block to appear, then return the fully-rendered HTML.
    """
    driver.get(url)

    # Wait for the main content selector (fall back gracefully)
    try:
        WebDriverWait(driver, PAGE_LOAD_TIMEOUT).until(
            EC.presence_of_element_located(
                (By.CSS_SELECTOR, "div.body_text, article, main")
            )
        )
    except Exception:
        pass   # page may still be usable even if selector times out

    # Brief extra pause for any lazy-loaded JS content
    time.sleep(1.0)
    return driver.page_source


# ══════════════════════════════════════════════════════════════════════════════
# HTML  →  MARKDOWN
# ══════════════════════════════════════════════════════════════════════════════

def clean(text: str) -> str:
    """Collapse whitespace and strip."""
    return re.sub(r"\s+", " ", text).strip()


def table_to_md(table) -> str:
    """Convert a <table> BeautifulSoup element to a Markdown table."""
    rows = []
    for tr in table.find_all("tr"):
        cells = []
        for td in tr.find_all(["th", "td"]):
            for code in td.find_all("code"):
                code.replace_with(f"`{code.get_text()}`")
            cells.append(clean(td.get_text(" ", strip=True)))
        if cells:
            rows.append(cells)

    if not rows:
        return ""

    col = max(len(r) for r in rows)
    for r in rows:
        r += [""] * (col - len(r))

    lines = [
        "| " + " | ".join(rows[0]) + " |",
        "| " + " | ".join(["---"] * col) + " |",
    ] + ["| " + " | ".join(r) + " |" for r in rows[1:]]

    return "\n".join(lines)


def guess_lang(el) -> str:
    for cls in el.get("class", []):
        cls = cls.lower()
        if "python" in cls:
            return "python"
        if "cpp" in cls or "mql" in cls:
            return "cpp"
    return ""


def element_to_md(el) -> str:
    """Recursively convert a single HTML element to Markdown text."""
    if not hasattr(el, "name") or el.name is None:
        return clean(str(el))

    tag = el.name

    if tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
        level = min(int(tag[1]) + 1, 6)   # shift h1→##, h2→###, …
        return f"\n{'#' * level} {clean(el.get_text())}\n"

    if tag == "p":
        for code in el.find_all("code"):
            code.replace_with(f"`{code.get_text()}`")
        text = clean(el.get_text(" ", strip=True))
        return f"\n{text}\n" if text else ""

    if tag == "pre":
        # Look for a nested <code> with a language class
        inner_code = el.find("code")
        lang = guess_lang(inner_code) if inner_code else guess_lang(el)
        return f"\n```{lang}\n{el.get_text()}\n```\n"

    if tag == "code":
        # Standalone <code> not inside <pre> → inline
        return f"`{el.get_text()}`"

    if tag == "table":
        md = table_to_md(el)
        return f"\n{md}\n" if md else ""

    if tag in ("ul", "ol"):
        items = []
        for i, li in enumerate(el.find_all("li", recursive=False)):
            for code in li.find_all("code"):
                code.replace_with(f"`{code.get_text()}`")
            bullet = f"{i + 1}." if tag == "ol" else "-"
            items.append(f"{bullet} {clean(li.get_text(' ', strip=True))}")
        return "\n" + "\n".join(items) + "\n" if items else ""

    if tag in ("div", "section", "article"):
        # Recurse into container elements
        parts = []
        for child in el.children:
            part = element_to_md(child)
            if part and part.strip():
                parts.append(part)
        return "\n".join(parts)

    # Anything else: just extract the text
    text = clean(el.get_text(" ", strip=True))
    return f"\n{text}\n" if text else ""


def page_to_markdown(html: str) -> str:
    """Parse rendered HTML and return clean Markdown for the docs content."""
    soup = BeautifulSoup(html, "html.parser")

    content = (
        soup.find("div", class_="body_text")
        or soup.find("article")
        or soup.find("main")
    )
    if not content:
        return "_Could not locate page content._\n"

    parts = []
    for child in content.children:
        md = element_to_md(child)
        if md and md.strip():
            parts.append(md)

    # Collapse 3+ consecutive blank lines into 2
    text = "\n".join(parts)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip() + "\n"


# ══════════════════════════════════════════════════════════════════════════════
# SCRAPING ORCHESTRATION
# ══════════════════════════════════════════════════════════════════════════════

def scrape(driver: webdriver.Edge, url: str, label: str) -> str:
    """Fetch one page and return its Markdown content."""
    print(f"  URL : {url}")
    try:
        html = fetch_html(driver, url)
        md   = page_to_markdown(html)
        lines = [l for l in md.splitlines() if l.strip()]
        print(f"  OK  : {len(lines)} content lines extracted")
        return md
    except Exception as exc:
        print(f"  ERR : {exc}")
        return f"_Error scraping `{label}`: {exc}_\n"


def build_document(driver: webdriver.Edge) -> str:
    total = len(TOPICS) + 1   # overview + all function pages
    out   = []

    # ── Document header ──────────────────────────────────────────────────────
    out.append(
        "# MetaTrader 5 Python Integration — Complete Reference\n\n"
        f"> Source: <{INDEX_URL}>\n\n"
        "---\n"
    )

    # ── Table of contents ────────────────────────────────────────────────────
    toc = ["## Table of Contents\n", "- [Overview](#overview)"]
    for name, _ in TOPICS:
        toc.append(f"- [{name}](#{name.replace('_', '-')})")
    out.append("\n".join(toc) + "\n\n---\n")

    # ── Overview page ────────────────────────────────────────────────────────
    print(f"\n[Page 1/{total}]  Overview")
    out.append("## Overview\n")
    out.append(scrape(driver, INDEX_URL, "Overview"))
    out.append("\n---\n")
    time.sleep(DELAY_BETWEEN_PAGES)

    # ── Per-function pages ───────────────────────────────────────────────────
    for idx, (name, slug) in enumerate(TOPICS, start=2):
        url = f"{BASE_URL}/en/docs/python_metatrader5/{slug}"
        print(f"\n[Page {idx}/{total}]  {name}")
        out.append(f"## {name}\n\n> <{url}>\n\n")
        out.append(scrape(driver, url, name))
        out.append("\n---\n")
        time.sleep(DELAY_BETWEEN_PAGES)

    return "\n".join(out)


# ══════════════════════════════════════════════════════════════════════════════
# MAIN
# ══════════════════════════════════════════════════════════════════════════════

def main():
    print("=" * 60)
    print("  MetaTrader 5 Python Docs Scraper")
    print("  Browser: Microsoft Edge  [VISIBLE — not headless]")
    print("=" * 60)

    print("\nLaunching Edge browser …")
    driver = create_driver()

    try:
        # Warm up: load the homepage so the site can set session cookies
        print("Warming up on homepage …")
        driver.get(BASE_URL)
        time.sleep(2.5)
        print("Ready.\n")

        markdown = build_document(driver)

    finally:
        print("\nClosing browser …")
        driver.quit()

    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        f.write(markdown)

    kb = len(markdown.encode()) / 1024
    print(f"\n{'=' * 60}")
    print(f"  Saved  →  {OUTPUT_FILE}")
    print(f"  Size   :  {kb:.1f} KB  ({len(markdown):,} characters)")
    print("=" * 60)


if __name__ == "__main__":
    main()