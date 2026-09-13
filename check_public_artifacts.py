"""Validate a built/public workstation before publishing; does not mutate data."""
import argparse,json,pathlib,re,subprocess

def validate(root, previous=None):
    root=pathlib.Path(root)
    for p in root.rglob('*'):
        if '.git' in p.parts or not p.is_file():continue
        rel=p.relative_to(root).as_posix()
        if p.is_symlink():raise ValueError('Symbolic link: '+rel)
        if 'imported' in p.parts or p.name in {'journal.json','user_journal.json'} or p.name.startswith('.env'):
            raise ValueError('Private artifact: '+rel)
        if p.suffix in {'.js','.json','.html','.txt','.md','.yml'}:
            if re.search(r'github_pat_[A-Za-z0-9_]{30,}|gh[pousr]_[A-Za-z0-9]{30,}|-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----',p.read_text()):
                raise ValueError('Credential pattern: '+rel)
    def read(p):return json.loads((root/p).read_text())
    meta=read('data/dashboard-meta.json');manifest=read('run-manifest.json')
    dates=sorted(p.stem for p in (root/'data/snapshots').glob('*.json') if re.fullmatch(r'\d{8}',p.stem))
    assert sorted(meta['dates'])==dates, 'meta must include every retained snapshot'
    assert meta['latestDate']==manifest['latestDate']==max(dates)
    assert manifest['snapshotDates']==meta['dates'] and manifest['snapshotCount']==len(dates)
    for d in dates:assert read('data/snapshots/'+d+'.json')['date']==d, 'snapshot date mismatch: '+d
    if previous:assert set(previous['dates'])<=set(dates), 'existing history would be removed'
    print('Public artifacts verified:',len(dates),'dates, latest',max(dates))

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('root');parser.add_argument('--previous-meta');a=parser.parse_args()
    validate(a.root,json.loads(pathlib.Path(a.previous_meta).read_text()) if a.previous_meta else None)
