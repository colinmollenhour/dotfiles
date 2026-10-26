#!/usr/bin/env python3
"""End-to-end test of restack-requests' stack-restack helper against real git repos and a fake forge."""

import argparse
import importlib.machinery
import importlib.util
import json
import os
import shutil
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / 'plugins/colin-shipping/skills/restack-requests/scripts/stack-restack'

loader = importlib.machinery.SourceFileLoader('stack_restack', str(SCRIPT))
spec = importlib.util.spec_from_loader('stack_restack', loader)
sr = importlib.util.module_from_spec(spec)
loader.exec_module(sr)


class FakeForge:
    name = 'fake'
    prefix = '#'
    number_re = r'/pull/(\d+)'

    def __init__(self):
        self.reqs = {}
        self.old_heads = {}

    def add(self, number, source, target, sha, state='open'):
        self.reqs[number] = {
            'number': number, 'title': f'req {number}', 'author': 'a', 'url': f'u/{number}',
            'source_branch': source, 'target_branch': target, 'sha': sha, 'state': state,
            'draft': False, 'same_repo': True, 'landed_sha': None, 'auto_merge': False, 'squash': True}

    def get(self, number):
        return dict(self.reqs[number])

    def list_open(self):
        return [dict(r) for r in self.reqs.values() if r['state'] == 'open']

    def search_merged(self, text):
        return []

    def heads(self, req):
        return self.old_heads.get(req['number'], [])

    def progress(self, number):
        return 'success', True

    def gates(self, req):
        return {'blockers': []}

    def retarget(self, number, branch):
        self.reqs[number]['target_branch'] = branch

    def settings(self):
        return {'default_branch': 'main', 'delete_branch_on_merge': True, 'warnings': []}


class RestackTest(unittest.TestCase):
    def setUp(self):
        self.tmp = Path(tempfile.mkdtemp(prefix='restack-test-'))
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.env = {**os.environ, 'GIT_AUTHOR_NAME': 't', 'GIT_AUTHOR_EMAIL': 't@t',
                    'GIT_COMMITTER_NAME': 't', 'GIT_COMMITTER_EMAIL': 't@t', 'GIT_CONFIG_GLOBAL': '/dev/null'}
        self.old_env = dict(os.environ)
        os.environ.update(self.env)
        self.addCleanup(lambda: (os.environ.clear(), os.environ.update(self.old_env)))
        self.origin = self.tmp / 'origin.git'
        self.work = self.tmp / 'work'
        subprocess.run(['git', 'init', '-q', '--bare', '-b', 'main', str(self.origin)], check=True)
        subprocess.run(['git', 'clone', '-q', str(self.origin), str(self.work)], check=True, stderr=subprocess.DEVNULL)
        self.old_cwd = os.getcwd()
        os.chdir(self.work)
        self.addCleanup(os.chdir, self.old_cwd)
        self.forge = FakeForge()

    def git(self, *args):
        return subprocess.run(['git', *args], check=True, text=True, stdout=subprocess.PIPE).stdout.strip()

    def commit(self, name, text=None):
        Path(name).write_text(text or name)
        self.git('add', name)
        self.git('commit', '-qm', f'add {name}')
        return self.git('rev-parse', 'HEAD')

    def branch(self, name, start):
        self.git('checkout', '-q', '-b', name, start)

    def push(self, *branches):
        for b in branches:
            self.git('push', '-q', '--force', 'origin', f'{b}:refs/heads/{b}')

    def build_stack(self):
        self.git('checkout', '-q', '-b', 'main')
        self.commit('base')
        self.push('main')
        self.branch('p', 'main')
        self.commit('p1')
        self.p_head = self.commit('p2')
        self.branch('c', 'p')
        self.commit('c1')
        self.c_head = self.commit('c2')
        self.branch('g', 'c')
        self.g_head = self.commit('g1')
        self.push('p', 'c', 'g')
        self.forge.add(1, 'p', 'main', self.p_head)
        self.forge.add(2, 'c', 'p', self.c_head)
        self.forge.add(3, 'g', 'c', self.g_head)

    def run_cmd(self, fn, **kw):
        return fn(argparse.Namespace(forge=self.forge, **kw))

    def tree(self, rev):
        return self.git('rev-parse', f'{rev}^{{tree}}')

    def test_merged_parent_is_squashed_and_children_follow(self):
        self.build_stack()
        plan_file = str(self.tmp / 'plan.json')
        plan = self.run_cmd(sr.cmd_plan, request='1', out=plan_file)
        self.assertEqual([d['number'] for d in plan['dependents']], [2, 3])
        self.assertEqual(plan['dependents'][0]['target_if_merged'], 'main')
        self.assertEqual(plan['dependents'][1]['target_if_merged'], 'c')

        # Squash-merge p into main; the forge deletes p and retargets nothing (publish does it).
        self.git('checkout', '-q', 'main')
        self.git('merge', '-q', '--squash', 'p')
        self.git('commit', '-qm', 'squash p')
        squash = self.git('rev-parse', 'HEAD')
        self.push('main')
        self.git('push', '-q', 'origin', ':refs/heads/p')
        self.forge.reqs[1].update(state='merged', landed_sha=squash)

        restack = self.run_cmd(sr.cmd_restack, plan=plan_file, allow_evil_merges=False)
        self.assertEqual(restack['mode'], 'merged')
        self.assertTrue(all(r['ok'] for r in restack['restack']), restack)
        published = self.run_cmd(sr.cmd_publish, plan=plan_file, only=None)['publish']
        self.assertTrue(all(e.get('pushed') for e in published), published)

        self.git('fetch', '-q', '--prune', 'origin')
        self.assertEqual(self.git('log', '--format=%s', 'origin/main..origin/c'), 'add c2\nadd c1')
        self.assertEqual(self.git('log', '--format=%s', 'origin/c..origin/g'), 'add g1')
        self.assertEqual(self.tree('origin/g'), self.tree(self.g_head))
        self.assertEqual(self.forge.reqs[2]['target_branch'], 'main')
        self.assertEqual(self.forge.reqs[3]['target_branch'], 'c')

    def test_open_parent_rewritten_children_follow_its_new_tip(self):
        self.build_stack()
        plan_file = str(self.tmp / 'plan.json')
        # The parent is amended after the children were stacked on it.
        self.git('checkout', '-q', 'p')
        self.git('reset', '-q', '--hard', 'p~1')
        new_p = self.commit('p2-amended')
        self.push('p')
        self.forge.reqs[1]['sha'] = new_p
        self.forge.old_heads[1] = [self.p_head]

        plan = self.run_cmd(sr.cmd_plan, request='1', out=plan_file)
        self.assertEqual([d['number'] for d in plan['dependents']], [2, 3])
        restack = self.run_cmd(sr.cmd_restack, plan=plan_file, allow_evil_merges=False)
        self.assertEqual(restack['mode'], 'open')
        self.assertTrue(all(r['ok'] for r in restack['restack']), restack)
        self.run_cmd(sr.cmd_publish, plan=plan_file, only=None)

        self.git('fetch', '-q', '--prune', 'origin')
        self.assertEqual(self.git('log', '--format=%s', 'origin/p..origin/c'), 'add c2\nadd c1')
        self.assertEqual(self.git('rev-parse', 'origin/c~2'), new_p)
        self.assertEqual(self.git('log', '--format=%s', 'origin/c..origin/g'), 'add g1')
        self.assertEqual(self.forge.reqs[2]['target_branch'], 'p')

    def test_up_to_date_children_are_left_alone(self):
        self.build_stack()
        plan_file = str(self.tmp / 'plan.json')
        self.run_cmd(sr.cmd_plan, request='1', out=plan_file)
        restack = self.run_cmd(sr.cmd_restack, plan=plan_file, allow_evil_merges=False)
        self.assertTrue(all(r.get('up_to_date') for r in restack['restack']), restack)
        published = self.run_cmd(sr.cmd_publish, plan=plan_file, only=None)['publish']
        self.assertFalse(any(e.get('pushed') for e in published), published)

    def test_conflict_is_reported_not_resolved(self):
        self.build_stack()
        plan_file = str(self.tmp / 'plan.json')
        self.run_cmd(sr.cmd_plan, request='1', out=plan_file)
        # Squash p, but main also changed the file c touches, differently.
        self.git('checkout', '-q', 'main')
        self.git('merge', '-q', '--squash', 'p')
        self.commit('c1', 'conflicting')
        self.push('main')
        self.git('push', '-q', 'origin', ':refs/heads/p')
        self.forge.reqs[1].update(state='merged', landed_sha=self.git('rev-parse', 'HEAD'))
        restack = self.run_cmd(sr.cmd_restack, plan=plan_file, allow_evil_merges=False)['restack']
        self.assertEqual(restack[0]['error'], 'conflict')
        self.assertEqual(restack[0]['conflict_files'], ['c1'])
        self.assertIn('not restacked', restack[1]['error'])
        published = self.run_cmd(sr.cmd_publish, plan=plan_file, only=None)['publish']
        self.assertFalse(any(e.get('pushed') for e in published))


if __name__ == '__main__':
    unittest.main()
