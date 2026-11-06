/** 47 findings about the made-up Pantry recipe app, in the shape of `decisions_add` input. Shared by the tests and the seed script. `dependsOn` ids count in the order added (d1 is the first). */
export const REVIEW_47: Record<string, any>[] = [
  {
    "group": "Search review",
    "kind": "finding",
    "section": "needs-you",
    "title": "Search ranking: exact matches sort below partial ones",
    "scenario": "Searching 'lemon' lists 'lemonade cake' above 'lemon'.",
    "recommendation": {
      "option": 1,
      "reason": "This is a real defect with a clear fix."
    },
    "sources": [
      {
        "label": "rank.ts:41",
        "path": "src/search/rank.ts:41"
      }
    ]
  },
  {
    "group": "Search review",
    "kind": "finding",
    "section": "claudes-call",
    "title": "Search ranking: the scoring weights are hard-coded",
    "scenario": "Changing how much a title match counts means editing and redeploying the code.",
    "recommendation": {
      "option": 1,
      "reason": "Small and safe to fix, so I am carrying on with the fix unless you object."
    },
    "sources": [
      {
        "label": "rank.ts:12",
        "path": "src/search/rank.ts:12"
      }
    ]
  },
  {
    "group": "Search review",
    "kind": "finding",
    "section": "claudes-call",
    "title": "Search indexing: the nightly rebuild takes 40 minutes",
    "scenario": "A recipe added at noon cannot be found until the next morning.",
    "recommendation": {
      "option": 1,
      "reason": "Small and safe to fix, so I am carrying on with the fix unless you object."
    },
    "sources": [
      {
        "label": "index.ts:88",
        "path": "src/search/index.ts:88"
      }
    ]
  },
  {
    "group": "Search review",
    "kind": "finding",
    "section": "claudes-call",
    "title": "Search indexing: deleted recipes stay in the index",
    "scenario": "A deleted recipe still shows up in results and opens a blank page.",
    "recommendation": {
      "option": 1,
      "reason": "Small and safe to fix, so I am carrying on with the fix unless you object."
    },
    "sources": [
      {
        "label": "index.ts:130",
        "path": "src/search/index.ts:130"
      }
    ],
    "blocks": "the search release"
  },
  {
    "group": "Search review",
    "kind": "finding",
    "section": "needs-you",
    "title": "Search filters: the diet filter matches any tag, not all",
    "scenario": "Choosing vegan and gluten-free lists recipes that are only one of them.",
    "recommendation": {
      "option": 1,
      "reason": "This is a real defect with a clear fix."
    },
    "sources": [
      {
        "label": "filters.ts:57",
        "path": "src/search/filters.ts:57"
      }
    ],
    "dependsOn": [
      "d1"
    ]
  },
  {
    "group": "Search review",
    "kind": "finding",
    "section": "claudes-call",
    "title": "Search input: there is no limit on the query length",
    "scenario": "Pasting a whole recipe into the box sends it all to the server.",
    "recommendation": {
      "option": 1,
      "reason": "Small and safe to fix, so I am carrying on with the fix unless you object."
    },
    "sources": [
      {
        "label": "query.ts:9",
        "path": "src/search/query.ts:9"
      }
    ]
  },
  {
    "group": "Search review",
    "kind": "finding",
    "section": "already-decided",
    "title": "Search input: the debounce is 50 ms",
    "scenario": "Typing quickly sends a request for almost every letter.",
    "recommendation": {
      "option": 2,
      "reason": "An earlier decision on this review settled it: see the first finding in the same area."
    },
    "sources": [
      {
        "label": "box.ts:22",
        "path": "src/search/box.ts:22"
      }
    ]
  },
  {
    "group": "Search review",
    "kind": "finding",
    "section": "claudes-call",
    "title": "Search results: the page size is fixed at 100",
    "scenario": "A slow phone waits for 100 recipe cards before anything shows.",
    "recommendation": {
      "option": 1,
      "reason": "Small and safe to fix, so I am carrying on with the fix unless you object."
    },
    "sources": [
      {
        "label": "page.ts:5",
        "path": "src/search/page.ts:5"
      }
    ]
  },
  {
    "group": "Search review",
    "kind": "finding",
    "section": "needs-you",
    "title": "Search results: the empty state says nothing useful",
    "scenario": "A search with no hits shows a blank page.",
    "recommendation": {
      "option": 1,
      "reason": "This is a real defect with a clear fix."
    },
    "sources": [
      {
        "label": "empty.tsx:3",
        "path": "src/search/empty.tsx:3"
      }
    ]
  },
  {
    "group": "Search review",
    "kind": "finding",
    "section": "claudes-call",
    "title": "Search suggestions: suggestions ignore the person's language",
    "scenario": "A French user gets English ingredient suggestions.",
    "recommendation": {
      "option": 1,
      "reason": "Small and safe to fix, so I am carrying on with the fix unless you object."
    },
    "sources": [
      {
        "label": "suggest.ts:30",
        "path": "src/search/suggest.ts:30"
      }
    ]
  },
  {
    "group": "Search review",
    "kind": "finding",
    "section": "claudes-call",
    "title": "Search suggestions: misspelt words return nothing",
    "scenario": "'tomatoe' finds no recipes.",
    "recommendation": {
      "option": 1,
      "reason": "Small and safe to fix, so I am carrying on with the fix unless you object."
    },
    "sources": [
      {
        "label": "suggest.ts:64",
        "path": "src/search/suggest.ts:64"
      }
    ]
  },
  {
    "group": "Search review",
    "kind": "finding",
    "section": "needs-you",
    "title": "Search permissions: private recipes appear in other people's results",
    "scenario": "A private recipe can be found by title from another account.",
    "recommendation": {
      "option": 1,
      "reason": "This is a real defect with a clear fix."
    },
    "sources": [
      {
        "label": "access.ts:18",
        "path": "src/search/access.ts:18"
      }
    ]
  },
  {
    "group": "Search review",
    "kind": "finding",
    "section": "claudes-call",
    "title": "Search logging: queries are logged with the account email",
    "scenario": "Search logs hold personal data longer than needed.",
    "recommendation": {
      "option": 1,
      "reason": "Small and safe to fix, so I am carrying on with the fix unless you object."
    },
    "sources": [
      {
        "label": "log.ts:14",
        "path": "src/search/log.ts:14"
      }
    ]
  },
  {
    "group": "Search review",
    "kind": "finding",
    "section": "needs-you",
    "title": "Search caching: results are cached without the filters",
    "scenario": "Two people with different filters can get each other's cached page.",
    "recommendation": {
      "option": 1,
      "reason": "This is a real defect with a clear fix."
    },
    "sources": [
      {
        "label": "cache.ts:27",
        "path": "src/search/cache.ts:27"
      }
    ]
  },
  {
    "group": "Search review",
    "kind": "finding",
    "section": "claudes-call",
    "title": "Search ranking: recent recipes get no boost",
    "scenario": "A new popular recipe sits below a five-year-old one.",
    "recommendation": {
      "option": 1,
      "reason": "Small and safe to fix, so I am carrying on with the fix unless you object."
    },
    "sources": [
      {
        "label": "rank.ts:77",
        "path": "src/search/rank.ts:77"
      }
    ],
    "dependsOn": [
      "d1",
      "d2"
    ]
  },
  {
    "group": "Search review",
    "kind": "finding",
    "section": "needs-you",
    "title": "Search indexing: the index job has no retry",
    "scenario": "A network blip leaves the index half built until the next night.",
    "recommendation": {
      "option": 1,
      "reason": "This is a real defect with a clear fix."
    },
    "sources": [
      {
        "label": "index.ts:12",
        "path": "src/search/index.ts:12"
      }
    ]
  },
  {
    "group": "Search review",
    "kind": "finding",
    "section": "claudes-call",
    "title": "Search filters: the time filter counts prep and cooking twice",
    "scenario": "A 20 minute recipe is listed as 40 minutes.",
    "recommendation": {
      "option": 1,
      "reason": "Small and safe to fix, so I am carrying on with the fix unless you object."
    },
    "sources": [
      {
        "label": "filters.ts:101",
        "path": "src/search/filters.ts:101"
      }
    ]
  },
  {
    "group": "Search review",
    "kind": "finding",
    "section": "already-decided",
    "title": "Search input: the clear button does not reset the filters",
    "scenario": "Clearing the box leaves yesterday's filters on.",
    "recommendation": {
      "option": 2,
      "reason": "An earlier decision on this review settled it: see the first finding in the same area."
    },
    "sources": [
      {
        "label": "box.ts:61",
        "path": "src/search/box.ts:61"
      }
    ]
  },
  {
    "group": "Search review",
    "kind": "finding",
    "section": "claudes-call",
    "title": "Search results: sorting by newest ignores edits",
    "scenario": "An updated recipe keeps its old position.",
    "recommendation": {
      "option": 1,
      "reason": "Small and safe to fix, so I am carrying on with the fix unless you object."
    },
    "sources": [
      {
        "label": "page.ts:48",
        "path": "src/search/page.ts:48"
      }
    ]
  },
  {
    "group": "Search review",
    "kind": "finding",
    "section": "claudes-call",
    "title": "Search suggestions: the list is not keyboard reachable",
    "scenario": "Arrow keys do nothing in the suggestions.",
    "recommendation": {
      "option": 1,
      "reason": "Small and safe to fix, so I am carrying on with the fix unless you object."
    },
    "sources": [
      {
        "label": "suggest.tsx:15",
        "path": "src/search/suggest.tsx:15"
      }
    ]
  },
  {
    "group": "Search review",
    "kind": "finding",
    "section": "claudes-call",
    "title": "Search permissions: shared-link recipes are not searchable by the owner",
    "scenario": "The owner cannot find their own shared recipe.",
    "recommendation": {
      "option": 1,
      "reason": "Small and safe to fix, so I am carrying on with the fix unless you object."
    },
    "sources": [
      {
        "label": "access.ts:52",
        "path": "src/search/access.ts:52"
      }
    ]
  },
  {
    "group": "Search review",
    "kind": "finding",
    "section": "already-decided",
    "title": "Search logging: slow queries are not recorded",
    "scenario": "Nobody can tell which searches take over a second.",
    "recommendation": {
      "option": 2,
      "reason": "An earlier decision on this review settled it: see the first finding in the same area."
    },
    "sources": [
      {
        "label": "log.ts:40",
        "path": "src/search/log.ts:40"
      }
    ]
  },
  {
    "group": "Search review",
    "kind": "finding",
    "section": "claudes-call",
    "title": "Search caching: the cache never expires",
    "scenario": "A corrected recipe title keeps its old text in results.",
    "recommendation": {
      "option": 1,
      "reason": "Small and safe to fix, so I am carrying on with the fix unless you object."
    },
    "sources": [
      {
        "label": "cache.ts:9",
        "path": "src/search/cache.ts:9"
      }
    ]
  },
  {
    "group": "Search review",
    "kind": "finding",
    "section": "needs-you",
    "title": "Search ranking: ties are broken by database order",
    "scenario": "Results move around between two identical searches.",
    "recommendation": {
      "option": 1,
      "reason": "This is a real defect with a clear fix."
    },
    "sources": [
      {
        "label": "rank.ts:90",
        "path": "src/search/rank.ts:90"
      }
    ]
  },
  {
    "group": "Image uploads",
    "kind": "finding",
    "section": "claudes-call",
    "title": "Image upload size: one user can use up another's quota",
    "scenario": "The quota is per server, so one large upload can leave others unable to upload.",
    "recommendation": {
      "option": 1,
      "reason": "Small and safe to fix, so I am carrying on with the fix unless you object."
    },
    "sources": [
      {
        "label": "quota.ts:20",
        "path": "src/uploads/quota.ts:20"
      }
    ]
  },
  {
    "group": "Image uploads",
    "kind": "finding",
    "section": "needs-you",
    "title": "Image upload size: there is no limit per file",
    "scenario": "A 200 MB photo is accepted and stored.",
    "recommendation": {
      "option": 1,
      "reason": "This is a real defect with a clear fix."
    },
    "sources": [
      {
        "label": "limits.ts:7",
        "path": "src/uploads/limits.ts:7"
      }
    ]
  },
  {
    "group": "Image uploads",
    "kind": "finding",
    "section": "claudes-call",
    "title": "Image upload format: HEIC photos from phones are rejected",
    "scenario": "An iPhone photo fails with a generic error.",
    "recommendation": {
      "option": 1,
      "reason": "Small and safe to fix, so I am carrying on with the fix unless you object."
    },
    "sources": [
      {
        "label": "types.ts:14",
        "path": "src/uploads/types.ts:14"
      }
    ]
  },
  {
    "group": "Image uploads",
    "kind": "finding",
    "section": "claudes-call",
    "title": "Image upload format: the file type is read from the name only",
    "scenario": "A renamed file is accepted as a photo.",
    "recommendation": {
      "option": 1,
      "reason": "Small and safe to fix, so I am carrying on with the fix unless you object."
    },
    "sources": [
      {
        "label": "types.ts:31",
        "path": "src/uploads/types.ts:31"
      }
    ]
  },
  {
    "group": "Image uploads",
    "kind": "finding",
    "section": "needs-you",
    "title": "Image storage: original photos are never deleted",
    "scenario": "Deleting a recipe leaves its photos in storage for good.",
    "recommendation": {
      "option": 1,
      "reason": "This is a real defect with a clear fix."
    },
    "sources": [
      {
        "label": "store.ts:66",
        "path": "src/uploads/store.ts:66"
      }
    ],
    "dependsOn": [
      "d26"
    ]
  },
  {
    "group": "Image uploads",
    "kind": "finding",
    "section": "claudes-call",
    "title": "Image storage: photos are public by URL",
    "scenario": "Anyone with the link sees a private recipe's photo.",
    "recommendation": {
      "option": 1,
      "reason": "Small and safe to fix, so I am carrying on with the fix unless you object."
    },
    "sources": [
      {
        "label": "store.ts:23",
        "path": "src/uploads/store.ts:23"
      }
    ]
  },
  {
    "group": "Image uploads",
    "kind": "finding",
    "section": "already-decided",
    "title": "Image resizing: thumbnails are made on the first view",
    "scenario": "The first visitor to a recipe waits for the resize.",
    "recommendation": {
      "option": 2,
      "reason": "An earlier decision on this review settled it: see the first finding in the same area."
    },
    "sources": [
      {
        "label": "resize.ts:40",
        "path": "src/uploads/resize.ts:40"
      }
    ]
  },
  {
    "group": "Image uploads",
    "kind": "finding",
    "section": "claudes-call",
    "title": "Image resizing: the aspect ratio is not kept",
    "scenario": "Tall photos are squashed in the card.",
    "recommendation": {
      "option": 1,
      "reason": "Small and safe to fix, so I am carrying on with the fix unless you object."
    },
    "sources": [
      {
        "label": "resize.ts:58",
        "path": "src/uploads/resize.ts:58"
      }
    ]
  },
  {
    "group": "Image uploads",
    "kind": "finding",
    "section": "needs-you",
    "title": "Image scanning: uploads are not scanned for viruses",
    "scenario": "A malicious file can be stored and served.",
    "recommendation": {
      "option": 1,
      "reason": "This is a real defect with a clear fix."
    },
    "sources": [
      {
        "label": "scan.ts:3",
        "path": "src/uploads/scan.ts:3"
      }
    ]
  },
  {
    "group": "Image uploads",
    "kind": "finding",
    "section": "claudes-call",
    "title": "Image scanning: the scan result is ignored when the scanner is down",
    "scenario": "Uploads go through unscanned during an outage.",
    "recommendation": {
      "option": 1,
      "reason": "Small and safe to fix, so I am carrying on with the fix unless you object."
    },
    "sources": [
      {
        "label": "scan.ts:29",
        "path": "src/uploads/scan.ts:29"
      }
    ]
  },
  {
    "group": "Image uploads",
    "kind": "finding",
    "section": "already-decided",
    "title": "Image metadata: location data stays in the photo",
    "scenario": "A kitchen photo reveals the home address.",
    "recommendation": {
      "option": 2,
      "reason": "An earlier decision on this review settled it: see the first finding in the same area."
    },
    "sources": [
      {
        "label": "meta.ts:11",
        "path": "src/uploads/meta.ts:11"
      }
    ]
  },
  {
    "group": "Image uploads",
    "kind": "finding",
    "section": "needs-you",
    "title": "Image alt text: there is no alt text field",
    "scenario": "Screen reader users hear only 'image'.",
    "recommendation": {
      "option": 1,
      "reason": "This is a real defect with a clear fix."
    },
    "sources": [
      {
        "label": "form.tsx:44",
        "path": "src/uploads/form.tsx:44"
      }
    ]
  },
  {
    "group": "Image uploads",
    "kind": "finding",
    "section": "claudes-call",
    "title": "Image upload progress: a failed upload gives no way to retry",
    "scenario": "The person starts again from the top of the form.",
    "recommendation": {
      "option": 1,
      "reason": "Small and safe to fix, so I am carrying on with the fix unless you object."
    },
    "sources": [
      {
        "label": "form.tsx:90",
        "path": "src/uploads/form.tsx:90"
      }
    ]
  },
  {
    "group": "Image uploads",
    "kind": "finding",
    "section": "already-decided",
    "title": "Image upload progress: the bar jumps from 0 to 100",
    "scenario": "A slow connection looks frozen.",
    "recommendation": {
      "option": 2,
      "reason": "An earlier decision on this review settled it: see the first finding in the same area."
    },
    "sources": [
      {
        "label": "progress.tsx:12",
        "path": "src/uploads/progress.tsx:12"
      }
    ]
  },
  {
    "group": "Image uploads",
    "kind": "finding",
    "section": "claudes-call",
    "title": "Image CDN: cache headers are missing",
    "scenario": "The same photo downloads on every page view.",
    "recommendation": {
      "option": 1,
      "reason": "Small and safe to fix, so I am carrying on with the fix unless you object."
    },
    "sources": [
      {
        "label": "cdn.ts:6",
        "path": "src/uploads/cdn.ts:6"
      }
    ]
  },
  {
    "group": "Image uploads",
    "kind": "finding",
    "section": "needs-you",
    "title": "Image CDN: old photo URLs break after a rename",
    "scenario": "Shared links show a broken image.",
    "recommendation": {
      "option": 1,
      "reason": "This is a real defect with a clear fix."
    },
    "sources": [
      {
        "label": "cdn.ts:35",
        "path": "src/uploads/cdn.ts:35"
      }
    ]
  },
  {
    "group": "Image uploads",
    "kind": "finding",
    "section": "already-decided",
    "title": "Image limits: the rate limit counts failed uploads",
    "scenario": "A person with a bad connection is locked out.",
    "recommendation": {
      "option": 2,
      "reason": "An earlier decision on this review settled it: see the first finding in the same area."
    },
    "sources": [
      {
        "label": "limits.ts:44",
        "path": "src/uploads/limits.ts:44"
      }
    ]
  },
  {
    "group": "Image uploads",
    "kind": "finding",
    "section": "claudes-call",
    "title": "Image storage: two uploads of one photo are stored twice",
    "scenario": "The same photo costs double.",
    "recommendation": {
      "option": 1,
      "reason": "Small and safe to fix, so I am carrying on with the fix unless you object."
    },
    "sources": [
      {
        "label": "store.ts:90",
        "path": "src/uploads/store.ts:90"
      }
    ]
  },
  {
    "group": "Image uploads",
    "kind": "finding",
    "section": "already-decided",
    "title": "Image resizing: animated files lose their animation",
    "scenario": "A short clip becomes a still.",
    "recommendation": {
      "option": 2,
      "reason": "An earlier decision on this review settled it: see the first finding in the same area."
    },
    "sources": [
      {
        "label": "resize.ts:75",
        "path": "src/uploads/resize.ts:75"
      }
    ]
  },
  {
    "group": "Image uploads",
    "kind": "finding",
    "section": "already-decided",
    "title": "Image metadata: the camera model is shown to every visitor",
    "scenario": "It is shown with no way to hide it.",
    "recommendation": {
      "option": 2,
      "reason": "An earlier decision on this review settled it: see the first finding in the same area."
    },
    "sources": [
      {
        "label": "meta.ts:40",
        "path": "src/uploads/meta.ts:40"
      }
    ]
  },
  {
    "group": "Image uploads",
    "kind": "finding",
    "section": "claudes-call",
    "title": "Image upload format: PNG screenshots are stored uncompressed",
    "scenario": "A screenshot recipe is 8 MB.",
    "recommendation": {
      "option": 1,
      "reason": "Small and safe to fix, so I am carrying on with the fix unless you object."
    },
    "sources": [
      {
        "label": "types.ts:55",
        "path": "src/uploads/types.ts:55"
      }
    ]
  },
  {
    "group": "Image uploads",
    "kind": "finding",
    "section": "already-decided",
    "title": "Image alt text: the card shows the file name as the label",
    "scenario": "'IMG_2043' is read out instead of the dish name.",
    "recommendation": {
      "option": 2,
      "reason": "An earlier decision on this review settled it: see the first finding in the same area."
    },
    "sources": [
      {
        "label": "card.tsx:8",
        "path": "src/uploads/card.tsx:8"
      }
    ]
  },
  {
    "group": "Image uploads",
    "kind": "finding",
    "section": "already-decided",
    "title": "Image CDN: the CDN origin is set in code",
    "scenario": "Switching region needs a release.",
    "recommendation": {
      "option": 2,
      "reason": "An earlier decision on this review settled it: see the first finding in the same area."
    },
    "sources": [
      {
        "label": "cdn.ts:2",
        "path": "src/uploads/cdn.ts:2"
      }
    ]
  }
]
