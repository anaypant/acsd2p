# parser.py
from email import policy
from email.parser import BytesParser
import re
from typing import Tuple, Optional
import logging
import email.utils

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def strip_quoted_reply(text: str) -> str:
    """
    Strips out quoted reply text from email body.
    Handles various email client formats and reply markers.
    """
    if not text:
        return text

    # Patterns that indicate the start of quoted content
    reply_markers = [
        # Common reply headers
        r'^On .+?\d{4}.*wrote:$',  # Most common: On Fri, May 30, 2025 at 12:13 PM <email> wrote:
        r'^On .+?\d{4}.*\n.*wrote:$',  # Multi-line version
        r'^From:.*$',               # Outlook, Apple Mail, etc.
        r'^Sent:.*$',               # Outlook
        r'^To:.*$',                 # Outlook
        r'^Subject:.*$',            # Outlook
        r'^Date:.*$',               # Common email header
        r'^Cc:.*$',                 # CC header
        r'^Bcc:.*$',                # BCC header
        
        # Quoted content indicators
        r'^>.*$',                   # Quoted lines
        r'^--\s*$',                # Signature
        r'^_{2,}$',                # Separator
        r'^={2,}$',                # Separator
        
        # Additional email client specific patterns
        r'^Begin forwarded message:$',
        r'^Forwarded by .*$',
        r'^From:.*\nSent:.*\nTo:.*$',  # Multi-line Outlook header
        r'^On .* wrote:.*$',           # Alternative format
        r'^On .* \d{1,2}/\d{1,2}/\d{2,4}.*wrote:$',  # Date format variations
        r'^On .* \d{1,2} \w+ \d{4}.*wrote:$',        # Another date format
    ]

    # Split into lines and process
    lines = text.split('\n')
    filtered_lines = []
    in_quoted_section = False
    consecutive_empty_lines = 0
    original_line_count = len(lines)
    
    for i, line in enumerate(lines):
        line = line.rstrip()  # Remove trailing whitespace
        
        # Check if this line starts a quoted section
        if not in_quoted_section:
            if any(re.match(pattern, line.strip(), re.IGNORECASE) for pattern in reply_markers):
                logger.info(f"Found reply marker at line {i}: {line.strip()}")
                in_quoted_section = True
                continue
                
            # Check for multi-line patterns (e.g., Outlook headers)
            if i < len(lines) - 1:
                next_line = lines[i + 1].strip()
                combined = f"{line}\n{next_line}"
                if any(re.match(pattern, combined, re.IGNORECASE) for pattern in reply_markers):
                    logger.info(f"Found multi-line reply marker at line {i}")
                    in_quoted_section = True
                    continue
        
        # If we're not in a quoted section, keep the line
        if not in_quoted_section:
            if line.strip() == '':
                consecutive_empty_lines += 1
                # Only keep up to 2 consecutive empty lines
                if consecutive_empty_lines <= 2:
                    filtered_lines.append(line)
            else:
                consecutive_empty_lines = 0
                filtered_lines.append(line)
    
    # Join lines and clean up
    cleaned_text = '\n'.join(filtered_lines)
    
    # Remove excessive whitespace
    cleaned_text = re.sub(r'\n{3,}', '\n\n', cleaned_text)  # Replace 3+ newlines with 2
    cleaned_text = cleaned_text.strip()
    
    # If we removed too much content, restore the original
    if len(cleaned_text) < 10 and original_line_count > 1:
        logger.info(f"Stripping removed too much content (cleaned: {len(cleaned_text)} chars), restoring original")
        return text.strip()
    
    logger.info(f"Original text length: {len(text)}, Cleaned text length: {len(cleaned_text)}")
    return cleaned_text

def parse_email(email_content: bytes) -> Tuple[Optional[object], Optional[str]]:
    """
    Parses raw email bytes and returns the email message and plain text part.
    Handles HTML-only emails by converting to plain text.
    """
    try:
        msg = BytesParser(policy=policy.default).parsebytes(email_content)
        plain_text = None
        html_text = None

        logger.info(f"Email content type: {msg.get_content_type()}")
        logger.info(f"Email is multipart: {msg.is_multipart()}")

        if msg.is_multipart():
            logger.info("Processing multipart email")
            for part in msg.iter_parts():
                content_type = part.get_content_type()
                logger.info(f"Processing part with content type: {content_type}")
                try:
                    charset = part.get_content_charset() or 'utf-8'
                    if content_type == 'text/plain':
                        part_content = part.get_payload(decode=True)
                        if part_content:
                            plain_text = part_content.decode(charset, errors='replace')
                            logger.info(f"Found plain text part, length: {len(plain_text)}")
                    elif content_type == 'text/html':
                        part_content = part.get_payload(decode=True)
                        if part_content:
                            html_text = part_content.decode(charset, errors='replace')
                            logger.info(f"Found HTML part, length: {len(html_text)}")
                except Exception as e:
                    logger.error(f"Error decoding part {content_type}: {str(e)}")
                    continue
        else:
            logger.info("Processing single part email")
            try:
                charset = msg.get_content_charset() or 'utf-8'
                content_type = msg.get_content_type()
                logger.info(f"Single part content type: {content_type}")
                
                if content_type == 'text/plain':
                    payload = msg.get_payload(decode=True)
                    if payload:
                        plain_text = payload.decode(charset, errors='replace')
                        logger.info(f"Found plain text, length: {len(plain_text)}")
                elif content_type == 'text/html':
                    payload = msg.get_payload(decode=True)
                    if payload:
                        html_text = payload.decode(charset, errors='replace')
                        logger.info(f"Found HTML, length: {len(html_text)}")
                else:
                    # Try to get payload anyway for other content types
                    try:
                        payload = msg.get_payload(decode=True)
                        if payload:
                            plain_text = payload.decode(charset, errors='replace')
                            logger.info(f"Extracted text from {content_type}, length: {len(plain_text)}")
                    except Exception as e:
                        logger.error(f"Error extracting payload from {content_type}: {str(e)}")
            except Exception as e:
                logger.error(f"Error decoding message: {str(e)}")

        # If no plain text but HTML exists, convert HTML to plain text
        if not plain_text and html_text:
            logger.info("Converting HTML to plain text")
            # Simple HTML to text conversion
            plain_text = re.sub(r'<[^>]+>', ' ', html_text)
            plain_text = re.sub(r'\s+', ' ', plain_text).strip()
            logger.info(f"Converted HTML to text, length: {len(plain_text)}")

        # If we still don't have text, try to get the raw payload
        if not plain_text:
            logger.info("No text found, trying raw payload extraction")
            try:
                # Try to get the raw payload as a fallback
                raw_payload = msg.get_payload()
                if isinstance(raw_payload, str):
                    plain_text = raw_payload
                    logger.info(f"Extracted raw string payload, length: {len(plain_text)}")
                elif isinstance(raw_payload, bytes):
                    plain_text = raw_payload.decode('utf-8', errors='replace')
                    logger.info(f"Extracted raw bytes payload, length: {len(plain_text)}")
                elif isinstance(raw_payload, list):
                    # Handle list of parts
                    for part in raw_payload:
                        if hasattr(part, 'get_payload'):
                            try:
                                part_content = part.get_payload(decode=True)
                                if part_content:
                                    plain_text = part_content.decode('utf-8', errors='replace')
                                    logger.info(f"Extracted text from list part, length: {len(plain_text)}")
                                    break
                            except Exception as e:
                                logger.error(f"Error extracting from list part: {str(e)}")
                                continue
            except Exception as e:
                logger.error(f"Error extracting raw payload: {str(e)}")

        # If we still don't have any text, create a minimal text from headers
        if not plain_text:
            logger.info("No text content found, creating minimal text from headers")
            subject = msg.get('Subject', 'No Subject')
            from_header = msg.get('From', 'Unknown Sender')
            plain_text = f"Subject: {subject}\nFrom: {from_header}\n\n[Email content could not be extracted]"

        # Clean the text by removing quoted replies
        if plain_text:
            original_length = len(plain_text)
            plain_text = strip_quoted_reply(plain_text)
            logger.info(f"Cleaned email body: {plain_text[:100]}...")  # Log first 100 chars
            logger.info(f"Original text length: {original_length}, Cleaned text length: {len(plain_text)}")
            
            # If cleaning removed all content, restore the original
            if len(plain_text) == 0 and original_length > 0:
                logger.info("Cleaning removed all content, restoring original")
                plain_text = f"Subject: {msg.get('Subject', 'No Subject')}\nFrom: {msg.get('From', 'Unknown Sender')}\n\n[Email content]"

        return msg, plain_text
    except Exception as e:
        logger.error(f"Error parsing email: {str(e)}")
        return None, None

def extract_email_headers(msg) -> Tuple[str, str, str]:
    """
    Returns Message-ID, In-Reply-To, References headers.
    Normalizes all IDs by stripping angle brackets and domain for consistent comparison/storage.
    """
    try:
        def normalize_msg_id(msg_id):
            if not msg_id:
                return ''
            msg_id = msg_id.strip().lstrip('<').rstrip('>')
            return msg_id.split('@')[0]

        msg_id = msg.get('Message-ID', '').strip()
        in_reply_to = msg.get('In-Reply-To', '').strip()
        references = msg.get('References', '').strip()

        # Normalize all IDs by stripping angle brackets and domain
        msg_id = normalize_msg_id(msg_id)
        in_reply_to = normalize_msg_id(in_reply_to)
        references = ' '.join([normalize_msg_id(ref) for ref in references.split()])

        # Combine References and In-Reply-To for better threading
        if in_reply_to and in_reply_to not in references:
            references = f"{references} {in_reply_to}".strip()

        logger.info(f"Extracted headers - Message-ID: {msg_id}, In-Reply-To: {in_reply_to}, References: {references}")
        return msg_id, in_reply_to, references
    except Exception as e:
        logger.error(f"Error extracting headers: {str(e)}")
        return '', '', ''

def extract_email_from_text(content: str) -> Optional[str]:
    """
    Extracts first email address from text.
    Validates email format more strictly.
    """
    if not content:
        return None
        
    try:
        # More strict email pattern
        pattern = r'[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[A-Za-z]{2,}'
        matches = re.findall(pattern, content)
        if matches:
            # Validate domain has at least one dot
            email = matches[0]
            if '.' in email.split('@')[1]:
                return email.lower()
        return None
    except Exception as e:
        logger.error(f"Error extracting email: {str(e)}")
        return None

def extract_user_info_from_headers(msg) -> dict:
    """
    Extracts user information from standard email headers.
    Only extracts information that is explicitly present in the headers.
    """
    user_info = {}
    
    # Extract and parse From header which often contains name and email
    from_header = msg.get('From', '')
    if from_header:
        user_info['from_header'] = from_header
        # Try to parse name and email from From header
        # Common format: "John Doe <john.doe@example.com>"
        try:
            name, email_addr = email.utils.parseaddr(from_header)
            if name:
                user_info['sender_name'] = name
            if email_addr:
                user_info['sender_email'] = email_addr.lower()
        except Exception as e:
            logger.error(f"Error parsing From header: {str(e)}")

    # Extract Reply-To header if present
    reply_to = msg.get('Reply-To', '')
    if reply_to:
        user_info['reply_to'] = reply_to
        # Try to parse name and email from Reply-To header
        try:
            name, email_addr = email.utils.parseaddr(reply_to)
            if name:
                user_info['reply_to_name'] = name
            if email_addr:
                user_info['reply_to_email'] = email_addr.lower()
        except Exception as e:
            logger.error(f"Error parsing Reply-To header: {str(e)}")

    # Extract Organization header if present
    organization = msg.get('Organization', '')
    if organization:
        user_info['organization'] = organization

    # Extract X-Mailer header which might indicate email client
    mailer = msg.get('X-Mailer', '')
    if mailer:
        user_info['mailer'] = mailer

    # Extract X-Originating-IP header if present
    originating_ip = msg.get('X-Originating-IP', '')
    if originating_ip:
        user_info['originating_ip'] = originating_ip

    # Extract X-Forwarded-For header if present
    forwarded_for = msg.get('X-Forwarded-For', '')
    if forwarded_for:
        user_info['forwarded_for'] = forwarded_for

    return user_info
