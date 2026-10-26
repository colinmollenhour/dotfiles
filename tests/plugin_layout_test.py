#!/usr/bin/env python3
"""Check the distributable plugin boundaries and bundled skill metadata."""
import json
from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent


class PluginLayoutTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.entries = json.loads((ROOT / '.claude-plugin/marketplace.json').read_text())['plugins']
        cls.plugins = {entry['name']: ROOT / entry['source'] for entry in cls.entries}

    def test_marketplace_sources_exist_and_match_manifests(self):
        self.assertEqual(len(self.entries), len(self.plugins))
        # Local tool metadata (such as .claude/) is not a distributable plugin.
        plugin_paths = {p for p in (ROOT / 'plugins').iterdir() if not p.name.startswith('.')}
        self.assertEqual(set(self.plugins.values()), plugin_paths)
        for name, plugin in self.plugins.items():
            with self.subTest(plugin=name):
                self.assertTrue(plugin.is_dir())
                manifest = json.loads((plugin / '.claude-plugin/plugin.json').read_text())
                self.assertEqual(name, manifest['name'])
                self.assertRegex(manifest['version'], r'^\d+\.\d+\.\d+$')
                for asset in plugin.rglob('*'):
                    self.assertTrue(asset.resolve().is_relative_to(plugin.resolve()), asset)

    def test_skill_names_are_unique_and_match_directories(self):
        names = set()
        for plugin in self.plugins.values():
            for skill in plugin.glob('skills/*/SKILL.md'):
                with self.subTest(skill=skill):
                    fm = skill.read_text().split('---', 2)[1]
                    name = re.search(r'^name:\s*(.+)$', fm, re.MULTILINE).group(1)
                    self.assertEqual(skill.parent.name, name)
                    self.assertNotIn(name, names)
                    names.add(name)
        self.assertIn('whiteboard', names)
        self.assertIn('megamind', names)

    def test_invocation_guards_ship_with_workflows(self):
        for skill in list((ROOT / 'plugins').glob('*/skills/*/SKILL.md')) + list((ROOT / 'pi-megamind/skills').glob('*/SKILL.md')):
            fm = skill.read_text().split('---', 2)[1]
            if re.search(r'^disable-model-invocation:\s*true\s*$', fm, re.MULTILINE):
                with self.subTest(skill=skill):
                    self.assertEqual('policy:\n  allow_implicit_invocation: false\n',
                                     (skill.parent / 'agents/openai.yaml').read_text())

    def test_dependencies_resolve_without_cycles(self):
        def visit(name, stack):
            self.assertNotIn(name, stack)
            self.assertIn(name, self.plugins)
            manifest = json.loads((self.plugins[name] / '.claude-plugin/plugin.json').read_text())
            for dependency in manifest.get('dependencies', []):
                visit(dependency, stack + [name])
        for name in self.plugins:
            visit(name, [])
        whiteboard = json.loads((self.plugins['whiteboard'] / '.claude-plugin/plugin.json').read_text())
        self.assertFalse(whiteboard.get('dependencies'))

    def test_mbod_can_call_sibling_mbot(self):
        skills = self.plugins['colin-shipping'] / 'skills'
        self.assertTrue((skills / 'many-brain-one-decision/../many-brain-one-task/mbot-run.ts').is_file())
        self.assertTrue((skills / 'many-brain-one-task/reference.md').is_file())

    def test_delivery_workflows_ship_complete_and_match_pi(self):
        skills = self.plugins['colin-shipping'] / 'skills'
        for name in ('full-send', 'full-stop', 'modernize'):
            source = skills / name
            mirror = ROOT / 'pi-megamind/skills' / name
            with self.subTest(skill=name):
                source_files = {p.relative_to(source) for p in source.rglob('*') if p.is_file()}
                mirror_files = {p.relative_to(mirror) for p in mirror.rglob('*') if p.is_file()}
                self.assertEqual(source_files, mirror_files)
                self.assertIn(Path('LICENSE'), source_files)
                self.assertIn(Path('agents/openai.yaml'), source_files)
                for relative in source_files:
                    self.assertEqual((source / relative).read_bytes(),
                                     (mirror / relative).read_bytes())
                for document in source.rglob('*.md'):
                    for link in re.findall(r'\]\(([^)]+)\)', document.read_text()):
                        if '://' not in link and not link.startswith('#'):
                            self.assertTrue((document.parent / link).is_file(), (document, link))

    def test_megamind_keeps_a_dedicated_agent(self):
        agent = self.plugins['megamind'] / 'agents/megamind.md'
        self.assertFalse(agent.is_symlink())
        self.assertNotIn('disable-model-invocation', agent.read_text().split('---', 2)[1])
        self.assertTrue((ROOT / '.opencode/agents/megamind.md').is_file())

    def test_whiteboard_works_when_copied_on_its_own(self):
        with tempfile.TemporaryDirectory(prefix='whiteboard-plugin-test-') as tmp:
            tmp = Path(tmp)
            plugin = tmp / 'plugin'
            shutil.copytree(self.plugins['whiteboard'], plugin)
            cli = plugin / 'skills/whiteboard/scripts/whiteboard'
            boards = tmp / 'boards'
            result = subprocess.run([str(cli), 'new', 'test/example', '--dir', str(boards), '--host', '127.0.0.1'],
                                    capture_output=True, text=True, check=True)
            self.assertIn(str(boards / 'test/example.html'), result.stdout)
            output = tmp / 'export.html'
            result = subprocess.run([str(cli), 'publish', 'test/example', '--dir', str(boards), '--out', str(output), '--host', '127.0.0.1'],
                                    capture_output=True, text=True, check=True)
            self.assertNotIn('WARNING not bundled', result.stderr)
            html = output.read_text()
            self.assertIn('/* /_wb/board.js */', html)
            self.assertNotIn('href="/_wb/board.css"', html)
            self.assertNotIn('src="/_wb/board.js"', html)


if __name__ == '__main__':
    unittest.main()
