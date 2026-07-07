```flow
st=>start: Start
op1=>operation: Load data
cond=>condition: Data valid?
op2=>operation: Process
op3=>operation: Report error
e=>end: End

st->op1->cond
cond(yes)->op2->e
cond(no)->op3->e
```
