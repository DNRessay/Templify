import re

from bs4 import CData, Comment, Doctype, Tag

# A page's nav often marks the current link with class="active"; that's the only
# expected difference between an otherwise identical header/footer across pages,
# so it's ignored when deciding whether two top-level elements are "the same".
_ACTIVE_CLASS_RE = re.compile(r'\s*class="active"')


def tag_key(tag):
    return _ACTIVE_CLASS_RE.sub("", str(tag))


def tag_keys(container):
    return [tag_key(c) for c in container.contents if isinstance(c, Tag)]


def common_prefix_len(sequences):
    if not sequences:
        return 0
    min_len = min(len(s) for s in sequences)
    p = 0
    while p < min_len and all(s[p] == sequences[0][p] for s in sequences):
        p += 1
    return p


def common_suffix_len(sequences, max_len=None):
    if not sequences:
        return 0
    min_len = min(len(s) for s in sequences)
    if max_len is not None:
        min_len = min(min_len, max_len)
    s = 0
    while s < min_len and all(seq[-(s + 1)] == sequences[0][-(s + 1)] for seq in sequences):
        s += 1
    return s


def split_region(container, prefix_tag_count, suffix_tag_count):
    contents = list(container.contents)
    tag_idx = [i for i, c in enumerate(contents) if isinstance(c, Tag)]

    prefix_end = tag_idx[prefix_tag_count - 1] + 1 if prefix_tag_count else 0
    suffix_start = tag_idx[-suffix_tag_count] if suffix_tag_count else len(contents)

    return contents[:prefix_end], contents[prefix_end:suffix_start], contents[suffix_start:]


def _render_node(node):
    if isinstance(node, Comment):
        return f"<!--{node}-->"
    if isinstance(node, Doctype):
        return f"<!DOCTYPE {node}>"
    if isinstance(node, CData):
        return f"<![CDATA[{node}]]>"
    return str(node)


def render_nodes(nodes):
    return "".join(_render_node(n) for n in nodes)
