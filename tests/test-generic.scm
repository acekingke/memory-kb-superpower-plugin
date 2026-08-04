(load "kb/engine.scm")
(load "kb/kb.scm")
(load "tests/test-harness.scm")

(check-expect "generic forbidden action rejects"
  (let* ((facts (cons '(forbidden delete production-db)
                      (cons '(do delete production-db) *facts*)))
         (fp (run-to-fixpoint facts *rules*)))
    (null? (find-contradictions fp)))
  #f)

(check-expect "domain capability above level rejects"
  (let* ((facts (append '((domain-capability permission-system project-lead approve-budget)
                          (domain-level permission-system project-lead 1)
                          (domain-level permission-system approve-budget 3)
                          (greater-than 3 1))
                        *facts*))
         (fp (run-to-fixpoint facts *rules*)))
    (null? (find-contradictions fp)))
  #f)

(check-expect "preference functional conflict rejects"
  (let ((facts (append '((prefers user language zh-CN)
                         (prefers user language en-US))
                       *facts*)))
    (null? (find-contradictions facts)))
  #f)

(check-expect "provenance records derived fact"
  (let* ((facts (cons '(done task-a) *facts*))
         (result (run-to-fixpoint/explain facts *rules*))
         (provenance (cdr result))
         (entry (find-provenance '(ready task-b)
                                 (cdr (run-to-fixpoint/explain
                                        (append '((done task-a)
                                                  (dep task-b task-a))
                                                *facts*)
                                        *rules*)))))
    (and entry (eq? (cadr entry) 'rule) (caddr entry)))
  'task-ready-by-dependency)

(test-summary)
