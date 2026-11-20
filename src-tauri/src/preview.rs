//! Link previews: fetch a web page and read its title, description and image
//! from the Open Graph / meta tags. Done in Rust so the webview avoids CORS.

use serde::Serialize;
use std::io::Read;
use std::time::Duration;

#[derive(Serialize, Default)]
pub struct Preview {
    pub url: String,
    pub title: String,
    pub description: String,
    pub image: String,
    pub site: String,
}

const MAX_BYTES: u64 = 1_500_000;

pub fn fetch(raw: &str) -> Result<Preview, String> {
    let url = url::Url::parse(raw.trim()).map_err(|e| format!("not a valid link: {e}"))?;
    if url.scheme() != "http" && url.scheme() != "https" {
        return Err("only http and https links can be previewed".into());
    }
    let agent = ureq::AgentBuilder::new()
        .timeout(Duration::from_secs(8))
        .redirects(5)
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) CanvasNotes/0.1")
        .build();
    let resp = agent.get(url.as_str()).call().map_err(|e| format!("couldn't load the page: {e}"))?;
    let final_url = url::Url::parse(resp.get_url()).unwrap_or(url.clone());
    let ctype = resp.content_type().to_ascii_lowercase();
    let mut out = Preview { url: final_url.to_string(), site: final_url.host_str().unwrap_or("").trim_start_matches("www.").to_string(), ..Default::default() };
    if ctype.starts_with("image/") {
        out.image = final_url.to_string();
        out.title = final_url.path_segments().and_then(|s| s.last()).unwrap_or("").to_string();
        return Ok(out);
    }
    let mut body = Vec::new();
    resp.into_reader().take(MAX_BYTES).read_to_end(&mut body).map_err(|e| e.to_string())?;
    let html = String::from_utf8_lossy(&body);
    let head = match html.to_ascii_lowercase().find("</head>") {
        Some(i) => &html[..i],
        None => &html[..],
    };

    let mut og_title = None;
    let mut og_desc = None;
    let mut og_image = None;
    let mut og_site = None;
    let mut meta_desc = None;
    for tag in tags(head, "meta") {
        let key = attr(tag, "property").or_else(|| attr(tag, "name")).unwrap_or_default().to_ascii_lowercase();
        // Skip empty values so an empty og:title doesn't hide the real <title>.
        let Some(content) = attr(tag, "content").filter(|c| !c.trim().is_empty()) else { continue };
        match key.as_str() {
            "og:title" | "twitter:title" => og_title = og_title.or(Some(content)),
            "og:description" | "twitter:description" => og_desc = og_desc.or(Some(content)),
            "og:image" | "og:image:url" | "twitter:image" => og_image = og_image.or(Some(content)),
            "og:site_name" => og_site = og_site.or(Some(content)),
            "description" => meta_desc = meta_desc.or(Some(content)),
            _ => {}
        }
    }
    let title_tag = {
        let lower = head.to_ascii_lowercase();
        lower.find("<title").and_then(|s| {
            let start = head[s..].find('>')? + s + 1;
            let end = lower[start..].find("</title>")? + start;
            Some(head[start..end].trim().to_string())
        })
    };
    out.title = decode(&og_title.or(title_tag).unwrap_or_default());
    out.description = decode(&og_desc.or(meta_desc).unwrap_or_default());
    if let Some(img) = og_image {
        if let Ok(abs) = final_url.join(decode(&img).trim()) {
            out.image = abs.to_string();
        }
    }
    if let Some(site) = og_site {
        out.site = decode(&site);
    }
    out.title = clip(&out.title.split_whitespace().collect::<Vec<_>>().join(" "), 200);
    out.description = clip(&out.description, 400);
    Ok(out)
}

fn clip(s: &str, n: usize) -> String {
    s.chars().take(n).collect()
}

/// Every `<name ...>` tag body (attributes part) in the document.
fn tags<'a>(html: &'a str, name: &str) -> Vec<&'a str> {
    let lower = html.to_ascii_lowercase();
    let open = format!("<{name}");
    let mut out = Vec::new();
    let mut i = 0;
    while let Some(p) = lower[i..].find(&open) {
        let s = i + p + open.len();
        let Some(e) = lower[s..].find('>') else { break };
        out.push(&html[s..s + e]);
        i = s + e;
    }
    out
}

/// Read attribute `name` from a tag body, handling "double", 'single' or bare values.
fn attr(tag: &str, name: &str) -> Option<String> {
    let lower = tag.to_ascii_lowercase();
    let mut from = 0;
    while let Some(p) = lower[from..].find(name) {
        let at = from + p;
        let before_ok = at == 0 || lower.as_bytes()[at - 1].is_ascii_whitespace();
        let rest = lower[at + name.len()..].trim_start();
        if before_ok && rest.starts_with('=') {
            let vstart = tag.len() - rest.len() + 1;
            let v = tag[vstart..].trim_start();
            let (q, body) = match v.chars().next() {
                Some(c @ ('"' | '\'')) => (Some(c), &v[1..]),
                _ => (None, v),
            };
            let end = match q {
                Some(c) => body.find(c).unwrap_or(body.len()),
                None => body.find(|c: char| c.is_whitespace() || c == '/').unwrap_or(body.len()),
            };
            return Some(body[..end].to_string());
        }
        from = at + name.len();
    }
    None
}

fn decode(s: &str) -> String {
    s.replace("&amp;", "&")
        .replace("&quot;", "\"")
        .replace("&#39;", "'")
        .replace("&#x27;", "'")
        .replace("&apos;", "'")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&nbsp;", " ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_meta_attributes() {
        assert_eq!(attr(r#" property="og:title" content="Hello &amp; bye""#, "content").as_deref(), Some("Hello &amp; bye"));
        assert_eq!(attr(" name=description content='single quoted'", "content").as_deref(), Some("single quoted"));
        assert_eq!(attr(" content=bare name=x", "content").as_deref(), Some("bare"));
        assert_eq!(decode("Tom &amp; Jerry &quot;hi&quot;"), "Tom & Jerry \"hi\"");
    }

    /// Hits the network; run with `cargo test -- --ignored`.
    #[test]
    #[ignore]
    fn fetches_a_real_page() {
        let p = fetch("https://www.rust-lang.org/").expect("fetch");
        assert!(!p.title.is_empty(), "title empty: {:?}", p.title);
        println!("{} | {} | {}", p.title, p.description, p.image);
    }
}
