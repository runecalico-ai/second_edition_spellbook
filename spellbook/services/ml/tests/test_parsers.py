import os
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

# Add parent dir to path to import spellbook_sidecar
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import spellbook_sidecar  # noqa: E402


class TestParsers(unittest.TestCase):
    def test_spell_from_markdown(self):
        # Mock Path
        p = MagicMock(spec=Path)
        p.read_text.return_value = """---
name: Fireball
level: 3
school: Evocation
source: PHB
---
A bright streak flashes from your pointing finger...
"""
        p.stem = "fireball"

        result = spellbook_sidecar._spell_from_markdown(p)
        self.assertEqual(result["name"], "Fireball")
        self.assertEqual(result["level"], 3)
        self.assertTrue("bright streak" in result["description"])

    @patch("spellbook_sidecar.extract_pdf_text")
    def test_spell_from_pdf(self, mock_extract):
        mock_extract.return_value = "Fireball\nLevel 3\nDescription..."
        p = MagicMock(spec=Path)
        p.stem = "fireball"

        result = spellbook_sidecar._spell_from_pdf(p)
        self.assertEqual(result["name"], "Fireball")
        self.assertEqual(result["source"], "PDF Import")

    @patch("spellbook_sidecar.Document")
    def test_spell_from_docx(self, mock_document_cls):
        mock_doc = MagicMock()
        p1 = MagicMock()
        p1.text = "Fireball"
        p2 = MagicMock()
        p2.text = "Description text"
        mock_doc.paragraphs = [p1, p2]
        mock_document_cls.return_value = mock_doc

        p = MagicMock(spec=Path)
        p.stem = "fireball"

        result = spellbook_sidecar._spell_from_docx(p)
        self.assertEqual(result["name"], "Fireball")
        self.assertEqual(result["source"], "DOCX Import")
        self.assertTrue("Fireball" in result["description"])


if __name__ == "__main__":
    unittest.main()
