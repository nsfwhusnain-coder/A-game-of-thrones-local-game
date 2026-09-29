import sys, subprocess, shutil, os
SP='/tmp/claude-0/-home-user-A-game-of-thrones-local-game/1a59ec30-8b4e-5558-8c33-823b20aa5156/scratchpad'
SRC='/home/user/wc-s2'; MUT=SP+'/mut'
def run(name, file, old, new, tests):
    shutil.copyfile(f'{SRC}/{file}', f'{MUT}/{file}')
    s=open(f'{MUT}/{file}').read()
    assert old in s, f'{name}: pattern not found'
    open(f'{MUT}/{file}','w').write(s.replace(old,new,1))
    res=[]
    for t in tests:
        p=subprocess.run(['node','--test',t],cwd=MUT,capture_output=True,text=True,env={**os.environ,'WC_PROVIDER':'mock'})
        out=p.stdout
        fails=[l for l in out.split('\n') if l.startswith('not ok')]
        passn=[l for l in out.split('\n') if l.startswith('# pass')]
        res.append((t, passn, fails[:4]))
    shutil.copyfile(f'{SRC}/{file}', f'{MUT}/{file}')
    print('==',name)
    for r in res: print('  ',r)
if __name__=='__main__':
    pass
